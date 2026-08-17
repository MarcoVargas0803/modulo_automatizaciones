const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const pool = require('../../../shared/db/pool');
const env = require('../../../shared/config/env');
const {
  createSession,
  findBlockingSession,
  newSessionId,
  revokeUserSessions,
} = require('../../../shared/services/session.service');
const { verifySapCredentials } = require('./sap.service');

/**
 * Verifica credenciales y abre una sesión de servidor.
 *
 * Devuelve una de tres formas, y la ruta las traduce a HTTP:
 *   - { success: false, message }                    -> 401
 *   - { success: false, code: 'SESSION_ALREADY_ACTIVE', conflict } -> 409
 *   - { success: true, token, user }                 -> 200
 *
 * @param {string} username
 * @param {string} password
 * @param {{replaceExistingSession?: boolean, ip?: string, userAgent?: string}} [options]
 */
async function loginUser(username, password, options = {}) {
  const { replaceExistingSession = false, ip = null, userAgent = null } = options;
  const result = await pool.query(
    `
    SELECT
      user_id,
      username,
      display_name,
      email,
      password_hash,
      auth_source,
      is_active
    FROM audit_portal.users
    WHERE username = $1
    LIMIT 1;
    `,
    [username]
  );

  if (result.rows.length === 0) {
    return {
      success: false,
      message: 'Usuario o contraseña incorrectos',
    };
  }

  const user = result.rows[0];

  if (!user.is_active) {
    return {
      success: false,
      message: 'Usuario o contraseña incorrectos',
    };
  }

  // Hibrido por usuario: auth_source decide contra quien se verifica la
  // contrasena. 'sap' delega en el Service Layer; el resto sigue con bcrypt
  // contra el hash local. El usuario debe existir en users pase lo que pase
  // (la busqueda de arriba), asi que un usuario de SAP sin fila local no entra.
  if (user.auth_source === 'sap') {
    const sapResult = await verifySapCredentials(username, password);

    if (!sapResult.configured) {
      return {
        success: false,
        message: 'La autenticación con SAP no está disponible en este momento.',
      };
    }

    if (sapResult.reachable === false) {
      return {
        success: false,
        message: 'No se pudo contactar a SAP para validar el acceso. Intente más tarde.',
      };
    }

    if (!sapResult.ok) {
      return {
        success: false,
        message: 'Usuario o contraseña incorrectos',
      };
    }
  } else {
    const passwordIsValid = await bcrypt.compare(password, user.password_hash);

    if (!passwordIsValid) {
      return {
        success: false,
        message: 'Usuario o contraseña incorrectos',
      };
    }
  }

  // Best-effort: un fallo aqui no debe tumbar el login, solo se pierde el dato de
  // "ultimo acceso" para esta vez.
  try {
    await pool.query(
      'UPDATE audit_portal.users SET last_login_at = NOW() WHERE user_id = $1;',
      [user.user_id],
    );
  } catch (error) {
    console.error('No se pudo registrar el ultimo acceso:', error.message);
  }

  // A partir de aqui las credenciales ya son validas y lo que se decide es la
  // SESION. Todo en una transaccion porque comprobar "hay sesion viva" e
  // insertar la nueva tienen que ser un solo paso: sin el bloqueo de abajo, dos
  // logins simultaneos del mismo usuario leerian los dos "no hay sesion" y
  // acabarian con dos sesiones vivas, que es justo lo que este modulo impide.
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Serializa los logins de ESTE usuario. Se bloquea la fila de users y no las
    // de user_sessions porque cuando no hay ninguna sesion no habria nada que
    // bloquear, que es precisamente el caso de la carrera.
    await client.query(
      'SELECT user_id FROM audit_portal.users WHERE user_id = $1 FOR UPDATE;',
      [user.user_id],
    );

    const blockingSession = await findBlockingSession(client, user.user_id);

    if (blockingSession && !replaceExistingSession) {
      await client.query('ROLLBACK');

      return {
        success: false,
        code: 'SESSION_ALREADY_ACTIVE',
        conflict: { lastSeenAt: blockingSession.lastSeenAt },
      };
    }

    // Barre tambien las sesiones ociosas, que no bloqueaban pero seguian siendo
    // validas: si no, el dispositivo abandonado conservaria un token utilizable.
    await revokeUserSessions(client, user.user_id, 'replaced');

    const sessionId = newSessionId();

    const token = jwt.sign(
      {
        userId: user.user_id,
        username: user.username,
        displayName: user.display_name,
        email: user.email,
        sid: sessionId,
      },
      env.auth.jwtSecret,
      {
        expiresIn: env.auth.jwtExpiresIn,
        audience: env.auth.jwtAudience,
        issuer: env.auth.jwtIssuer,
      }
    );

    // La caducidad de la fila se lee del token ya firmado en vez de recalcularse
    // a partir de JWT_EXPIRES_IN: asi la sesion y el token no pueden desalinearse.
    const expiresAt = new Date(jwt.decode(token).exp * 1000);

    await createSession(client, {
      userId: user.user_id,
      sessionId,
      expiresAt,
      ip,
      userAgent,
    });

    await client.query('COMMIT');

    return {
      success: true,
      token,
      user: {
        userId: user.user_id,
        username: user.username,
        displayName: user.display_name,
        email: user.email,
      },
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Perfil del usuario y procesos a los que tiene acceso.
 *
 * Se llamaba `getUserSession` y el nombre enganaba: no sabe nada de sesiones
 * —son dos SELECT de perfil y permisos— pero hacia que el viejo control de
 * duplicidad aparentara comprobar "hay sesion?" cuando solo comprobaba "sigue
 * activo?". La sesion de verdad vive en shared/services/session.service.js.
 */
async function getUserProfileAndProcesses(userId) {
  const userResult = await pool.query(
    `SELECT 
      user_id,
      username,
      display_name,
      email,
      is_active
    FROM audit_portal.users
    WHERE user_id = $1
    LIMIT 1;`, [userId],
  );

  if (userResult.rows.length === 0){
    return null;
  }

  const user = userResult.rows[0];

  if(!user.is_active){
    return null;
  }

  const processesResult = await pool.query(
    // Antes esta consulta no filtraba can_view: la sesion listaba procesos que el
    // usuario no puede ver. Tampoco comprobaba u.is_active, aunque eso ya lo cubre
    // el corte de :106, que devuelve null antes de llegar aqui.
    `SELECT
      process_code,
      process_name,
      description,
      role,
      can_view,
      can_export
    FROM audit_portal.v_user_process_access_effective
    WHERE user_id = $1
    ORDER BY process_name;`, [userId],
  );

  return {
    user: {
      userId: user.user_id,
      username: user.username,
      displayName: user.display_name,
      email: user.email,
    },
    processes: processesResult.rows,
  };
}

module.exports = {
  loginUser,
  getUserProfileAndProcesses,
};
