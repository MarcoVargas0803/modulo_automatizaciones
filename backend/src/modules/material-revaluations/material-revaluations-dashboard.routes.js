const express = require("express");
const pool = require("../../shared/db/pool");
const { requireAuth } = require("../../shared/middlewares/auth.middleware");
const { requireProcess } = require("../../shared/middlewares/access.middleware");
const { buildErrorResponse } = require("../../shared/utils/errorResponse");

const router = express.Router();

const PROCESS_CODE = "material_revaluation";

const guard = [requireAuth, requireProcess(PROCESS_CODE)];

// Cuántos revisores caben en la tarjeta del Dashboard. Es presentación, no dato:
// por eso se queda aquí y no en la vista.
const REVIEWER_LIMIT = 5;

// KPIs del proceso de revaluación de material.
//
// Los tres agregados viven en vistas del esquema material_revaluations y se apoyan
// a su vez en v_execution_approvals_web, que ya resuelve display_approval_status
// (APROBADO / RECHAZADO / PENDIENTE) y response_duration_ms. Lo accionable es
// pendientes_mas_24h: una revaluación esperando aprobación bloquea inventario.
//
// El umbral de 24 h y el filtro por process_code están ahora en el DDL de las
// vistas; la constante STALE_APPROVAL_HOURS se borró de aquí para no dejar dos
// fuentes de verdad. El detalle del AT TIME ZONE explícito —obligatorio porque
// requested_at_mx no lleva zona y now() sí— viajó con ella.
router.get(
  "/material-revaluations/dashboard-summary",
  ...guard,
  async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT
        (SELECT row_to_json(aprobaciones)
           FROM material_revaluations.v_dashboard_approvals_web aprobaciones) AS approvals,
        (SELECT row_to_json(ejecuciones)
           FROM material_revaluations.v_dashboard_executions_web ejecuciones) AS executions,
        (SELECT COALESCE(json_agg(row_to_json(revisores) ORDER BY revisores.total DESC), '[]'::json)
           FROM (
             SELECT approved_by, total
             FROM material_revaluations.v_dashboard_reviewers_web
             ORDER BY total DESC
             LIMIT $1
           ) revisores) AS reviewers;
      `,
        [REVIEWER_LIMIT],
      );

      res.json({
        success: true,
        data: result.rows[0],
      });
    } catch (error) {
      res
        .status(500)
        .json(
          buildErrorResponse(
            "Error al consultar los indicadores de revaluaciones",
            error,
          ),
        );
    }
  },
);

// Analítica financiera para la vista de auditoría: costo de flete prorrateado
// (costoFlete) en las revaluaciones completadas (status SUCCESS). El dato vive en
// el payload JSONB de audit.workflow_events; se toma un costoFlete por ejecución,
// priorizando el evento que también trae folio_flete. Los productos revaluados no
// se persisten como arreglo (solo su conteo), así que aquí no hay desglose por
// producto: eso queda para cuando el workflow los guarde.
router.get(
  "/material-revaluations/audit-financials",
  ...guard,
  async (req, res) => {
    try {
      const result = await pool.query(
        `WITH rev AS (
          SELECT DISTINCT ON (x.execution_id)
            x.execution_id,
            COALESCE(x.completed_at, x.created_at) AS completed_at,
            NULLIF(e.payload ->> 'costoFlete', '')::numeric AS costo_flete
          FROM audit.workflow_execution x
          JOIN audit.workflow_events e ON e.execution_id = x.execution_id
          WHERE x.process_code = 'material_revaluation'
            AND x.status = 'SUCCESS'
            AND (e.payload ->> 'costoFlete') ~ '^[0-9]+(\\.[0-9]+)?$'
          ORDER BY x.execution_id, (e.payload ? 'folio_flete') DESC, e.created_at DESC
        )
        SELECT
          (SELECT COALESCE(json_agg(row_to_json(m) ORDER BY m.period), '[]'::json)
             FROM (
               SELECT to_char(date_trunc('month', completed_at AT TIME ZONE 'America/Mexico_City'), 'YYYY-MM') AS period,
                      count(*)::int AS revaluaciones,
                      COALESCE(sum(costo_flete), 0)::numeric AS costo_flete
               FROM rev
               GROUP BY 1
             ) m) AS by_month,
          json_build_object(
            'revaluaciones', (SELECT count(*)::int FROM rev),
            'costo_flete_total', (SELECT COALESCE(sum(costo_flete), 0)::numeric FROM rev),
            'costo_flete_promedio', (SELECT COALESCE(round(avg(costo_flete), 2), 0)::numeric FROM rev)
          ) AS totals;`,
      );

      res.json({
        success: true,
        data: result.rows[0],
      });
    } catch (error) {
      res
        .status(500)
        .json(
          buildErrorResponse(
            "Error al consultar la analítica financiera de revaluaciones",
            error,
          ),
        );
    }
  },
);

module.exports = router;
