const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { loadSessionState } = require('../services/session.service');
const { ensureCsrfCookie } = require('./csrf.middleware');

// La cache de is_active que vivia aqui se mudo a session.service.js: ahora una
// sola consulta resuelve el estado del usuario Y el de su sesion, asi que
// mantener dos caches para la misma fila no tenia sentido. El numero de viajes a
// la base por peticion no cambia (uno, cacheado 60 s).

async function requireAuth(req, res, next) {
  const token = req.cookies[env.auth.cookieName];

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'No hay sesión activa',
    });
  }

  let decoded;

  try {
    decoded = jwt.verify(token, env.auth.jwtSecret, {
      audience: env.auth.jwtAudience,
      issuer: env.auth.jwtIssuer,
    });
  } catch {
    return res.status(401).json({
      success: false,
      message: 'Sesión inválida o expirada',
    });
  }

  // user_id es BIGINT y node-postgres devuelve los int8 como string, asi que el token
  // puede traer "1" o 1 segun la ruta. Se valida la forma sin convertir el valor.
  if (!/^\d+$/.test(String(decoded.userId ?? ''))) {
    return res.status(401).json({
      success: false,
      message: 'Sesión inválida o expirada',
    });
  }

  let state;

  try {
    state = await loadSessionState(decoded.userId, decoded.sid);
  } catch (error) {
    console.error('Error al validar el estado del usuario de la sesión:', error);

    return res.status(503).json({
      success: false,
      message: 'No se pudo validar la sesión en este momento',
    });
  }

  if (!state.isActive) {
    return res.status(401).json({
      success: false,
      message: 'Sesión inválida o usuario inactivo',
    });
  }

  // Es la unica senal que recibe el usuario legitimo de que alguien mas entro con
  // su cuenta. Sin este codigo, el frontend solo puede decir "tu sesion expiro",
  // que es justo lo contrario de lo que hay que comunicar.
  //
  // El motivo importa: solo 'replaced' significa que entraron con su cuenta. Un
  // 'logout' lo hizo el propio usuario, y presentarselo como intrusion seria
  // sencillamente falso.
  if (state.session === 'revoked' && state.revokedReason === 'replaced') {
    return res.status(401).json({
      success: false,
      code: 'SESSION_REVOKED',
      message: 'Tu sesión se cerró porque se inició sesión en otro dispositivo',
    });
  }

  if (state.session === 'revoked' && state.revokedReason === 'admin') {
    return res.status(401).json({
      success: false,
      code: 'SESSION_CLOSED_BY_ADMIN',
      message: 'Un administrador cerró tu sesión',
    });
  }

  // Cubre tanto un `sid` ausente —tokens emitidos antes de que existieran las
  // sesiones de servidor— como uno que no corresponde a ninguna fila.
  if (state.session !== 'valid') {
    return res.status(401).json({
      success: false,
      message: 'Sesión inválida o expirada',
    });
  }

  req.user = {
    userId: decoded.userId,
    username: decoded.username,
    displayName: decoded.displayName,
    email: decoded.email,
    sessionId: decoded.sid,
  };

  ensureCsrfCookie(req, res);

  return next();
}

module.exports = {
  requireAuth,
};
