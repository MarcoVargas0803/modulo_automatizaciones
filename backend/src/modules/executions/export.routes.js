const express = require("express");
const pool = require("../../shared/db/pool");
const { requireAuth } = require("../../shared/middlewares/auth.middleware");
const { buildExecutionFilters } = require("./utils/executionFilters");
const { rowsToCsv } = require("../../shared/utils/csv");
const { validateExecutionQuery } = require("./utils/validateExecutionQuery");
const { buildErrorResponse } = require("../../shared/utils/errorResponse");
const {
  accessControlJoins,
  accessControlConditions,
} = require("./utils/accessControl");

const router = express.Router();

router.get("/exports/executions.csv", requireAuth, async (req, res) => {
  try {
    const validation = validateExecutionQuery(req.query);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: "Filtros inválidos",
        errors: validation.errors,
      });
    }

    const userId = req.user.userId;

    const permissionResult = await pool.query(
      // "Tiene permiso de exportacion en algun proceso vigente". La vista anade
      // la comprobacion de proceso activo, que esta consulta no hacia.
      `SELECT COUNT(*)::INT AS total
                FROM audit_portal.v_user_process_access_effective
                WHERE user_id = $1
                    AND can_export = TRUE;`,
      [userId],
    );
    if (permissionResult.rows[0].total === 0) {
      return res.status(403).json({
        success: false,
        message: "El usuario no tiene permisos para exportar informacion",
      });
    }

    const baseValues = [userId];

    const { filterSql, values: filterValues } = buildExecutionFilters(
      req.query,
      baseValues,
    );

    // Mismo criterio que GET /executions, para que el CSV salga en el orden que
    // muestra la tabla. `sortOrder` ya viene validado contra la lista blanca de
    // validateExecutionQuery, y el ternario solo puede producir ASC o DESC.
    const sortDirection = req.query.sortOrder === "oldest" ? "ASC" : "DESC";

    const result = await pool.query(
      `SELECT
                v.execution_id,
                v.process_code,
                v.process_name,
                v.workflow_name,
                v.display_status,
                v.source_reference,
                v.created_at_mx,
                v.completed_at_mx,
                v.duration_ms,
                v.total_events,
                v.error_events,
                v.total_transactions,
                v.error_transactions,
                v.total_approvals,
                v.total_subjects,
                v.error_message
            FROM audit_portal.v_execution_dashboard_web v
                ${accessControlJoins("v")}
                WHERE ${accessControlConditions("$1", { requireExport: true })}
                    ${filterSql}
                ORDER BY v.created_at_mx ${sortDirection};`,
      filterValues,
    );

    const csv = rowsToCsv(result.rows);

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=ejecuciones_auditoria.csv",
    );

    res.send(csv);
  } catch (error) {
    res
      .status(500)
      .json(buildErrorResponse("Error al exportar ejecuciones", error));
  }
});

module.exports = router;
