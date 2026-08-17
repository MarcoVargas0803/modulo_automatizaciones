const pool = require("../db/pool");

// Registrar la accion nunca debe tumbar la operacion que la origino: si el INSERT
// falla se reporta en el log del servidor y la peticion sigue su curso.
async function logActivity(req, { action, entityType = null, entityId = null, detail = null }) {
  try {
    await pool.query(
      `INSERT INTO audit_portal.activity_log
        (user_id, username, action, entity_type, entity_id, detail, ip)
       VALUES ($1, $2, $3, $4, $5, $6, $7);`,
      [
        req.user?.userId || null,
        req.user?.username || null,
        action,
        entityType,
        entityId === null || entityId === undefined ? null : String(entityId),
        detail,
        req.ip || null,
      ],
    );
  } catch (error) {
    console.error(`No se pudo registrar la actividad "${action}":`, error.message);
  }
}

module.exports = {
  logActivity,
};
