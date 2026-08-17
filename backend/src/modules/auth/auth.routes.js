const express = require("express");
const {
  loginUser,
  getUserProfileAndProcesses,
} = require("./services/auth.service");
const { requireAuth } = require("../../shared/middlewares/auth.middleware");
const {
  revokeSessionById,
} = require("../../shared/services/session.service");
const { loginLimiter } = require("../../shared/middlewares/rate-limit.middleware");
const {
  clearCsrfCookie,
  requireCsrf,
  setCsrfCookie,
} = require("../../shared/middlewares/csrf.middleware");
const env = require("../../shared/config/env");
const { buildErrorResponse } = require("../../shared/utils/errorResponse");
const { logActivity } = require("../../shared/utils/activityLog");

const router = express.Router();

router.post("/auth/login", loginLimiter, async (req, res) => {
  try {
    const { username, password, replaceExistingSession = false } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: "Usuario y contraseña son obligatorios",
      });
    }

    const loginResult = await loginUser(username, password, {
      replaceExistingSession,
      ip: req.ip,
      userAgent: req.get("user-agent"),
    });

    // El conflicto de sesión lo decide ahora la base, dentro de la transacción
    // del login. Antes se resolvía leyendo la cookie del PROPIO solicitante, así
    // que por construcción solo veía el mismo navegador: entre dispositivos
    // distintos no había nada que comparar.
    if (loginResult.code === "SESSION_ALREADY_ACTIVE") {
      return res.status(409).json({
        success: false,
        code: "SESSION_ALREADY_ACTIVE",
        message: "Ya existe una sesión activa en otro dispositivo o navegador",
        lastSeenAt: loginResult.conflict.lastSeenAt,
      });
    }

    if (!loginResult.success) {
      return res.status(401).json({
        success: false,
        message: loginResult.message,
      });
    }

    // Cookie de sesion: SIN maxAge ni expires. Asi el navegador la descarta al cerrarse
    // y no queda sesion viva en un equipo compartido. La expiracion del JWT sigue
    // operando como tope maximo del lado del servidor.
    res.cookie(env.auth.cookieName, loginResult.token, {
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: env.auth.cookieSecure,
    });
    setCsrfCookie(res);

    logActivity(
      { user: { userId: loginResult.user.userId, username: loginResult.user.username }, ip: req.ip },
      { action: "auth.login", entityType: "user", entityId: loginResult.user.userId },
    );

    res.json({
      success: true,
      message: "Inicio de sesión exitoso",
      user: loginResult.user,
    });
  } catch (error) {
    res.status(500).json(buildErrorResponse("Error al iniciar sesión", error));
  }
});

router.get("/auth/me", requireAuth, async (req, res) => {
  try {
    const session = await getUserProfileAndProcesses(req.user.userId);

    if (!session) {
      return res.status(401).json({
        success: false,
        message: "Sesión inválida o usuario inactivo",
      });
    }

    res.json({
      success: true,
      user: session.user,
      processes: session.processes,
    });
  } catch (error) {
    res
      .status(500)
      .json(
        buildErrorResponse("Error al consultar la sesión del usuario", error),
      );
  }
});

router.post("/auth/logout", requireAuth, requireCsrf, async (req, res) => {
  try {
    await revokeSessionById(req.user.userId, req.user.sessionId, "logout");
  } catch (error) {
    console.error("No se pudo revocar la sesion al cerrar:", error.message);
  }

  res.clearCookie(env.auth.cookieName, {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: env.auth.cookieSecure,
  });
  clearCsrfCookie(res);

  logActivity(req, { action: "auth.logout", entityType: "user", entityId: req.user.userId });

  res.json({
    success: true,
    message: "Sesion cerrada correctamente",
  });
});

module.exports = router;
