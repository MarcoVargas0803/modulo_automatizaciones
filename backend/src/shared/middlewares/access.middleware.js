const pool = require("../db/pool");

// Unica compuerta de acceso por proceso. Antes cada modulo decidia distinto:
// mantenimiento y revaluaciones comparaban el username contra un literal, y compras
// internacionales exigia que el usuario tuviera exactamente un proceso. Eso hacia
// imposible dar de alta usuarios nuevos sin tocar codigo.
const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function requireProcess(processCode, { role = null, requireExport = false, denyAuditorWrite = false } = {}) {
  return async function processGate(req, res, next) {
    try {
      const result = await pool.query(
        // v_user_process_access_effective ya exige can_view, usuario activo y
        // proceso activo. Es la unica definicion de "acceso vigente" del portal:
        // antes este triple JOIN estaba copiado en 6 sitios y cuatro divergian.
        `SELECT can_view, can_export, role
           FROM audit_portal.v_user_process_access_effective
          WHERE user_id = $1
            AND process_code = $2
          LIMIT 1;`,
        [req.user?.userId, processCode],
      );

      const access = result.rows[0];

      if (!access) {
        return res.status(403).json({
          success: false,
          message: "No tienes acceso a este modulo",
        });
      }

      // 'ambos' es un rol superset de mantenimiento: satisface tanto los gates de
      // 'encargado' como los de 'auditor'. Rompe la separacion de funciones a
      // proposito (un mismo usuario solicita y aprueba); usar solo para cuentas
      // de prueba/soporte, no operativas.
      if (role && access.role !== role && access.role !== "ambos") {
        return res.status(403).json({
          success: false,
          message: "Tu perfil no tiene permitida esta operacion",
        });
      }

      if (requireExport && access.can_export !== true) {
        return res.status(403).json({
          success: false,
          message: "Tu perfil no tiene permisos de exportacion",
        });
      }

      if (denyAuditorWrite && access.role === "auditor_maestro" && WRITE_METHODS.has(req.method)) {
        return res.status(403).json({
          success: false,
          message: "Tu perfil de auditor es de solo lectura",
        });
      }

      req.processAccess = access;

      return next();
    } catch (error) {
      console.error(`Error al validar el acceso al proceso ${processCode}:`, error);

      return res.status(500).json({
        success: false,
        message: "Error al validar el acceso al modulo",
      });
    }
  };
}

module.exports = {
  requireProcess,
};
