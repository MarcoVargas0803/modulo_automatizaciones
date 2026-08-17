const crypto = require("crypto");

const pool = require("../db/pool");

// Ciclo de vida de las sesiones de usuario (audit_portal.user_sessions).
//
// Vive en shared/ y no dentro de modules/auth porque lo consumen TRES sitios:
// el módulo auth (crear y revocar), este mismo middleware de autenticación
// (validar en cada petición) y el módulo admin (cierre forzado). Que admin
// importara del módulo auth violaría la regla de dependencia #2: un módulo no
// depende de otro. No toca Express —solo la base—, así que cumple la regla dura
// #6 del backend.
//
// El SQL del esquema, con el razonamiento completo del diseño, está en
// scripts/schema-auth-sessions.sql.

// Tras este tiempo sin actividad, una sesión deja de BLOQUEAR un login nuevo.
// Ojo: no deja de ser válida (ver los dos predicados en el script del esquema).
// Es lo que impide que cerrar el navegador sin hacer logout deje al usuario
// fuera de su propia cuenta.
const SESSION_IDLE_LEASE_MS = 15 * 60 * 1000;

// Mismo TTL que tenía la caché de is_active que este módulo absorbe. Acota el
// número de lecturas por petición a una cada 60 s por sesión, y de paso marca
// el ritmo con el que se refresca last_seen_at.
const SESSION_CACHE_TTL_MS = 60 * 1000;

// Caché en memoria del proceso. Hoy es correcta porque producción corre un solo
// contenedor sin réplicas ni cluster (docker-compose.yml). El día que se escale
// en horizontal, una revocación tardaría hasta SESSION_CACHE_TTL_MS en verse
// desde las otras réplicas: la invalidación explícita de abajo solo alcanza al
// proceso que la ejecuta.
const sessionCache = new Map();

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// user_id es BIGINT y node-postgres devuelve los int8 como string, así que el
// mismo usuario puede llegar como "1" o como 1 según el camino. Se normaliza
// para que la clave de caché no dependa de eso.
function cacheKey(userId, sessionId) {
  return `${String(userId)}:${sessionId}`;
}

function isUuid(value) {
  return typeof value === "string" && UUID_REGEX.test(value);
}

/**
 * Estado de una sesión tal y como lo necesita requireAuth.
 *
 * @typedef {object} SessionState
 * @property {boolean} isActive   El usuario existe y sigue activo.
 * @property {'valid'|'revoked'|'missing'} session
 *   `revoked` se distingue a propósito de `missing`: es la única forma de decirle
 *   al usuario legítimo que su sesión se cerró porque alguien entró con su cuenta,
 *   en vez del genérico "tu sesión expiró".
 * @property {'logout'|'replaced'|'admin'|'user_deactivated'|null} revokedReason
 *   Solo con `session === 'revoked'`. Importa porque no todos los motivos se le
 *   cuentan igual al usuario: `replaced` es "entraron con tu cuenta", pero
 *   `logout` es algo que hizo él mismo y anunciárselo como intrusión sería falso.
 */

/**
 * Lee de una sola consulta si el usuario está activo y si la sesión sigue viva.
 *
 * Sustituye a la antigua `isUserActive` del middleware: hace el mismo número de
 * viajes a la base (uno, cacheado), pero ahora también resuelve la sesión.
 *
 * @param {string|number} userId
 * @param {string} sessionId UUID que viaja en el JWT como `sid`.
 * @returns {Promise<SessionState>}
 */
async function loadSessionState(userId, sessionId) {
  // Un `sid` con forma inválida ni siquiera llega a la base: `$2::uuid` lanzaría
  // un 22P02 y el middleware lo traduciría a un 503 engañoso.
  if (!isUuid(sessionId)) {
    return { isActive: false, session: "missing" };
  }

  const key = cacheKey(userId, sessionId);
  const cached = sessionCache.get(key);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const result = await pool.query(
    `
    SELECT
      u.is_active,
      s.session_id,
      s.revoked_at,
      s.revoked_reason,
      s.expires_at
    FROM audit_portal.users u
    LEFT JOIN audit_portal.user_sessions s
      ON s.session_id = $2::uuid
     AND s.user_id = u.user_id
    WHERE u.user_id = $1
    LIMIT 1;
    `,
    [userId, sessionId],
  );

  const row = result.rows[0];
  const isActive = row?.is_active === true;

  let session = "missing";
  let revokedReason = null;

  if (row?.session_id) {
    if (row.revoked_at) {
      session = "revoked";
      revokedReason = row.revoked_reason;
    } else if (new Date(row.expires_at).getTime() > Date.now()) {
      session = "valid";
    }
    // Una sesión vencida cae en `missing`: su JWT también habrá vencido —las dos
    // fechas son la misma— así que jwt.verify ya habrá cortado antes.
  }

  const value = { isActive, session, revokedReason };
  sessionCache.set(key, { value, expiresAt: Date.now() + SESSION_CACHE_TTL_MS });

  // Solo al reconstruir la entrada, de modo que la escritura ocurre como mucho
  // una vez por minuto y por sesión en vez de una por petición.
  if (isActive && session === "valid") {
    touchSession(sessionId);
  }

  return value;
}

/**
 * Refresca `last_seen_at`. Best-effort deliberado, igual que el registro de
 * `last_login_at`: perder el arrendamiento de una sesión no justifica tumbar la
 * petición que el usuario estaba haciendo. Como mucho, un login concurrente vería
 * la sesión más ociosa de lo que está.
 *
 * @param {string} sessionId
 */
function touchSession(sessionId) {
  pool
    .query(
      `UPDATE audit_portal.user_sessions
          SET last_seen_at = now()
        WHERE session_id = $1::uuid
          AND revoked_at IS NULL;`,
      [sessionId],
    )
    .catch((error) => {
      console.error(
        "No se pudo refrescar la actividad de la sesion:",
        error.message,
      );
    });
}

/**
 * Devuelve la sesión viva y con actividad reciente de un usuario, si la hay.
 * Es el predicado de BLOQUEO: lo que decide si el login responde 409.
 *
 * Se le pasa el `client` de la transacción del login a propósito — tiene que
 * leer dentro del mismo bloqueo que después inserta, o dos logins simultáneos
 * verían los dos "no hay sesión".
 *
 * @param {import('pg').PoolClient} client
 * @param {string|number} userId
 * @returns {Promise<{sessionId: string, lastSeenAt: Date, ip: string|null} | null>}
 */
async function findBlockingSession(client, userId) {
  const result = await client.query(
    `
    SELECT session_id, last_seen_at, ip
    FROM audit_portal.user_sessions
    WHERE user_id = $1
      AND revoked_at IS NULL
      AND expires_at > now()
      AND last_seen_at > now() - ($2::bigint * interval '1 millisecond')
    ORDER BY last_seen_at DESC
    LIMIT 1;
    `,
    [userId, SESSION_IDLE_LEASE_MS],
  );

  const row = result.rows[0];

  return row
    ? { sessionId: row.session_id, lastSeenAt: row.last_seen_at, ip: row.ip }
    : null;
}

/**
 * Revoca todas las sesiones vivas de un usuario. Barre también las ociosas, que
 * no bloqueaban pero seguían siendo válidas: si no, el dispositivo abandonado
 * conservaría un token utilizable.
 *
 * @param {import('pg').PoolClient|import('pg').Pool} executor Cliente de una
 *   transacción, o el pool si la revocación va suelta (logout, admin).
 * @param {string|number} userId
 * @param {'logout'|'replaced'|'admin'|'user_deactivated'} reason
 * @returns {Promise<number>} Cuántas sesiones se revocaron.
 */
async function revokeUserSessions(executor, userId, reason) {
  const result = await executor.query(
    `
    UPDATE audit_portal.user_sessions
       SET revoked_at = now(),
           revoked_reason = $2
     WHERE user_id = $1
       AND revoked_at IS NULL;
    `,
    [userId, reason],
  );

  invalidateUserCache(userId);

  return result.rowCount;
}

/**
 * Revoca UNA sesión concreta. Es lo que usa el logout: cierra la sesión que hizo
 * la petición, no todas las del usuario. Hoy la diferencia es teórica —la regla
 * de negocio permite una sola sesión viva— pero deja el logout correcto si esa
 * regla cambiara.
 *
 * @param {string|number} userId Solo para invalidar la caché, que va por usuario.
 * @param {string} sessionId
 * @param {'logout'|'replaced'|'admin'|'user_deactivated'} reason
 * @returns {Promise<number>}
 */
async function revokeSessionById(userId, sessionId, reason) {
  if (!isUuid(sessionId)) {
    return 0;
  }

  const result = await pool.query(
    `
    UPDATE audit_portal.user_sessions
       SET revoked_at = now(),
           revoked_reason = $2
     WHERE session_id = $1::uuid
       AND revoked_at IS NULL;
    `,
    [sessionId, reason],
  );

  invalidateUserCache(userId);

  return result.rowCount;
}

/**
 * Crea la fila de sesión. El `sessionId` y el `expiresAt` los decide quien llama,
 * porque los dos salen del JWT ya firmado: el id va dentro del token y la fecha
 * es su `exp`. Derivarlos aquí obligaría a reinterpretar JWT_EXPIRES_IN y a
 * tener dos fuentes de verdad para la misma caducidad.
 *
 * @param {import('pg').PoolClient} client
 * @param {{userId: string|number, sessionId: string, expiresAt: Date, ip?: string|null, userAgent?: string|null}} session
 */
async function createSession(client, { userId, sessionId, expiresAt, ip, userAgent }) {
  await client.query(
    `
    INSERT INTO audit_portal.user_sessions
      (session_id, user_id, expires_at, ip, user_agent)
    VALUES ($1::uuid, $2, $3, $4, $5);
    `,
    [sessionId, userId, expiresAt, ip || null, userAgent || null],
  );
}

/**
 * Genera un identificador de sesión. Aislado aquí para que el formato (UUID v4,
 * que es lo que espera la columna) se decida en un solo sitio.
 *
 * @returns {string}
 */
function newSessionId() {
  return crypto.randomUUID();
}

/**
 * Borra de la caché todas las entradas de un usuario. Necesario porque la clave
 * incluye el `sid` y una revocación por usuario no sabe cuáles había vivos.
 * El recorrido es sobre un Map del tamaño del padrón de usuarios conectados.
 *
 * @param {string|number} userId
 */
function invalidateUserCache(userId) {
  const prefix = `${String(userId)}:`;

  for (const key of sessionCache.keys()) {
    if (key.startsWith(prefix)) {
      sessionCache.delete(key);
    }
  }
}

module.exports = {
  SESSION_IDLE_LEASE_MS,
  createSession,
  findBlockingSession,
  invalidateUserCache,
  loadSessionState,
  newSessionId,
  revokeSessionById,
  revokeUserSessions,
};
