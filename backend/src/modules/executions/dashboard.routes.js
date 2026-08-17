const express = require("express");
const pool = require("../../shared/db/pool");
const { requireAuth } = require("../../shared/middlewares/auth.middleware");
const { buildExecutionFilters } = require("./utils/executionFilters");
const { validateExecutionQuery } = require("./utils/validateExecutionQuery");
const { buildErrorResponse } = require("../../shared/utils/errorResponse");
const {
  accessControlJoins,
  accessControlConditions,
} = require("./utils/accessControl");

const router = express.Router();

const KNOWN_STATUSES = "('EXITOSA','ERROR','EN PROCESO','INCOMPLETA')";

const DEFAULT_RANGE_DAYS = 30;
const MAX_RANGE_DAYS = 180;
const TOP_ERRORS_LIMIT = 10;

const RANGE_CTE = `
  rango AS (
    SELECT
      COALESCE(
        $2::date,
        (now() AT TIME ZONE 'America/Mexico_City')::date - ($4::int - 1)
      ) AS d_from,
      COALESCE(
        $3::date,
        (now() AT TIME ZONE 'America/Mexico_City')::date
      ) AS d_to
  )`;

function parseRangeDays(value) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return DEFAULT_RANGE_DAYS;
  }

  return Math.min(parsed, MAX_RANGE_DAYS);
}

// Los tres endpoints con eje temporal comparten la misma cabecera de parámetros:
// $1 usuario, $2 dateFrom, $3 dateTo, $4 ventana en días. Los filtros que añada
// buildExecutionFilters siguen a partir de $5.
function buildRangeValues(req) {
  return [
    req.user.userId,
    req.query.dateFrom || null,
    req.query.dateTo || null,
    parseRangeDays(req.query.days),
  ];
}

function rejectInvalidQuery(req, res) {
  const validation = validateExecutionQuery(req.query);

  if (validation.isValid) {
    return false;
  }

  res.status(400).json({
    success: false,
    message: "Filtros inválidos",
    errors: validation.errors,
  });

  return true;
}

function echoFilters(req) {
  return {
    status: req.query.status || null,
    processCode: req.query.processCode || null,
    dateFrom: req.query.dateFrom || null,
    dateTo: req.query.dateTo || null,
    search: req.query.search || null,
  };
}

router.get("/dashboard/summary", requireAuth, async (req, res) => {
  try {
    if (rejectInvalidQuery(req, res)) {
      return;
    }

    const userId = req.user.userId;

    const baseValues = [userId];

    const { filterSql, values: filterValues } = buildExecutionFilters(
      req.query,
      baseValues,
    );

    const result = await pool.query(
      `SELECT
                COUNT(*)::INT AS total_executions,

                COUNT(*) FILTER(
                    WHERE v.display_status = 'EXITOSA'
                )::INT AS successful_executions,

                COUNT(*) FILTER(
                    WHERE v.display_status = 'ERROR'
                )::INT AS error_executions,

                COUNT(*) FILTER(
                    WHERE v.display_status = 'EN PROCESO'
                )::INT AS in_progress_executions,

                COUNT(*) FILTER(
                    WHERE v.display_status = 'INCOMPLETA'
                )::INT AS incomplete_executions,

                -- COALESCE porque display_status puede ser NULL (el CASE de la
                -- vista arrastra un we.status nulo) y 'NULL NOT IN (...)' es NULL,
                -- no TRUE: sin esto la fila no caería en ningún contador y el
                -- total dejaría de cuadrar con la suma.
                COUNT(*) FILTER(
                    WHERE COALESCE(v.display_status, '(sin estado)') NOT IN ${KNOWN_STATUSES}
                )::INT AS other_executions,

                COUNT(*) FILTER(
                    WHERE v.display_status IN ('EXITOSA', 'ERROR')
                )::INT AS finished_executions,

                COALESCE(SUM(v.total_events), 0)::INT AS total_events,
                COALESCE(SUM(v.error_events), 0)::INT AS error_events,

                COALESCE(SUM(v.total_transactions), 0)::INT AS total_transactions,
                COALESCE(SUM(v.error_transactions), 0)::INT AS error_transactions,

                COALESCE(SUM(v.total_approvals), 0)::INT AS total_approvals,
                COALESCE(SUM(v.total_subjects), 0)::INT AS total_subjects,

                COALESCE(AVG(v.duration_ms), 0)::INT AS average_duration_ms,

                -- duration_ms es NULL mientras completed_at lo sea, así que los
                -- percentiles y el máximo solo miran ejecuciones terminadas.
                COALESCE(
                    percentile_cont(0.5) WITHIN GROUP (ORDER BY v.duration_ms::float8), 0
                )::INT AS p50_duration_ms,
                COALESCE(
                    percentile_cont(0.9) WITHIN GROUP (ORDER BY v.duration_ms::float8), 0
                )::INT AS p90_duration_ms,
                COALESCE(MAX(v.duration_ms), 0)::INT AS max_duration_ms
                    FROM audit_portal.v_execution_dashboard_web v
                    ${accessControlJoins("v")}
                    WHERE ${accessControlConditions("$1")}
                ${filterSql};
            `,
      filterValues,
    );

    res.json({
      success: true,
      data: result.rows[0],
      filters: echoFilters(req),
    });
  } catch (error) {
    res
      .status(500)
      .json(
        buildErrorResponse(
          "Error al consultar el resumen del dashboard",
          error,
        ),
      );
  }
});

// Serie diaria por estado. generate_series rellena los días sin ejecuciones:
// sin él la gráfica uniría dos puntos separados por una semana muerta y
// sugeriría una actividad que no existió.
router.get("/dashboard/timeseries", requireAuth, async (req, res) => {
  try {
    if (rejectInvalidQuery(req, res)) {
      return;
    }

    const baseValues = buildRangeValues(req);

    // Las fechas ya viajan como $2/$3 y acotan el CTE de rango; pasárselas otra
    // vez a buildExecutionFilters duplicaría la condición.
    const { filterSql, values } = buildExecutionFilters(
      { ...req.query, dateFrom: undefined, dateTo: undefined },
      baseValues,
    );

    const result = await pool.query(
      `WITH ${RANGE_CTE},
        dias AS (
          SELECT generate_series(r.d_from, r.d_to, INTERVAL '1 day')::date AS dia
          FROM rango r
        ),
        ejec AS (
          SELECT
            date_trunc('day', v.created_at_mx)::date AS dia,
            v.display_status
          FROM audit_portal.v_execution_dashboard_web v
          ${accessControlJoins("v")}
          CROSS JOIN rango r
          WHERE ${accessControlConditions("$1")}
            AND v.created_at_mx >= r.d_from
            AND v.created_at_mx < r.d_to + INTERVAL '1 day'
            ${filterSql}
        )
        SELECT
          to_char(d.dia, 'YYYY-MM-DD') AS date,
          COUNT(e.dia)::INT AS total,
          COUNT(*) FILTER (WHERE e.display_status = 'EXITOSA')::INT AS successful,
          COUNT(*) FILTER (WHERE e.display_status = 'ERROR')::INT AS errors,
          COUNT(*) FILTER (WHERE e.display_status = 'EN PROCESO')::INT AS in_progress,
          COUNT(*) FILTER (WHERE e.display_status = 'INCOMPLETA')::INT AS incomplete,
          COUNT(*) FILTER (
            WHERE e.dia IS NOT NULL
              AND COALESCE(e.display_status, '(sin estado)') NOT IN ${KNOWN_STATUSES}
          )::INT AS other
        FROM dias d
        LEFT JOIN ejec e ON e.dia = d.dia
        GROUP BY d.dia
        ORDER BY d.dia;
      `,
      values,
    );

    res.json({
      success: true,
      data: result.rows,
      filters: echoFilters(req),
    });
  } catch (error) {
    res
      .status(500)
      .json(
        buildErrorResponse(
          "Error al consultar la serie temporal del dashboard",
          error,
        ),
      );
  }
});

// Desglose proceso x estado. Solo tiene sentido para quien ve más de un proceso:
// el resumen agregado le esconde justo lo que necesita, cuál de ellos falla.
router.get("/dashboard/by-process", requireAuth, async (req, res) => {
  try {
    if (rejectInvalidQuery(req, res)) {
      return;
    }

    const baseValues = [req.user.userId];

    const { filterSql, values } = buildExecutionFilters(req.query, baseValues);

    const result = await pool.query(
      `SELECT
          v.process_code,
          COALESCE(v.process_name, v.process_code) AS process_name,
          COUNT(*)::INT AS total,
          COUNT(*) FILTER (WHERE v.display_status = 'EXITOSA')::INT AS successful,
          COUNT(*) FILTER (WHERE v.display_status = 'ERROR')::INT AS errors,
          COUNT(*) FILTER (WHERE v.display_status = 'EN PROCESO')::INT AS in_progress,
          COUNT(*) FILTER (WHERE v.display_status = 'INCOMPLETA')::INT AS incomplete,
          COUNT(*) FILTER (
            WHERE COALESCE(v.display_status, '(sin estado)') NOT IN ${KNOWN_STATUSES}
          )::INT AS other,
          COALESCE(
            percentile_cont(0.5) WITHIN GROUP (ORDER BY v.duration_ms::float8), 0
          )::INT AS p50_duration_ms
        FROM audit_portal.v_execution_dashboard_web v
        ${accessControlJoins("v")}
        WHERE ${accessControlConditions("$1")}
        ${filterSql}
        GROUP BY v.process_code, v.process_name
        ORDER BY total DESC;
      `,
      values,
    );

    res.json({
      success: true,
      data: result.rows,
      filters: echoFilters(req),
    });
  } catch (error) {
    res
      .status(500)
      .json(
        buildErrorResponse(
          "Error al consultar el desglose por proceso",
          error,
        ),
      );
  }
});

// Qué está fallando, no cuántas veces. "Ejecuciones con error: 41" no es
// accionable; "31 de esos errores salen del mismo nodo" sí lo es.
router.get("/dashboard/top-errors", requireAuth, async (req, res) => {
  try {
    if (rejectInvalidQuery(req, res)) {
      return;
    }

    const values = buildRangeValues(req);

    // buildExecutionFilters está escrito contra el alias v y contra columnas de
    // v_execution_dashboard_web (display_status, source_reference) que esta
    // vista no tiene. Aquí solo aplica el filtro de proceso, a mano.
    let processFilterSql = "";

    if (req.query.processCode) {
      values.push(req.query.processCode);
      processFilterSql = `AND e.process_code = $${values.length}`;
    }

    values.push(TOP_ERRORS_LIMIT);

    const result = await pool.query(
      `WITH ${RANGE_CTE}
        SELECT
          COALESCE(NULLIF(btrim(e.node_name), ''), '(sin nodo)') AS node_name,
          COALESCE(NULLIF(btrim(e.event_name), ''), '(sin evento)') AS event_name,
          COALESCE(e.process_name, e.process_code) AS process_name,
          COUNT(*)::INT AS error_count,
          COUNT(DISTINCT e.execution_id)::INT AS affected_executions,
          MAX(e.created_at_mx) AS last_seen,
          left(
            (array_agg(e.error_message ORDER BY e.created_at_mx DESC))[1], 160
          ) AS sample_message
        FROM audit_portal.v_execution_events_web e
        ${accessControlJoins("e")}
        CROSS JOIN rango r
        WHERE ${accessControlConditions("$1")}
          AND e.has_error = TRUE
          AND e.created_at_mx >= r.d_from
          AND e.created_at_mx < r.d_to + INTERVAL '1 day'
          ${processFilterSql}
        GROUP BY 1, 2, 3
        ORDER BY error_count DESC, last_seen DESC
        LIMIT $${values.length};
      `,
      values,
    );

    res.json({
      success: true,
      data: result.rows,
      filters: echoFilters(req),
    });
  } catch (error) {
    res
      .status(500)
      .json(
        buildErrorResponse(
          "Error al consultar los errores más frecuentes",
          error,
        ),
      );
  }
});

module.exports = router;
