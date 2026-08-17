const express = require("express");
const pool = require("../../shared/db/pool");
const { requireAuth } = require("../../shared/middlewares/auth.middleware");
const { getPagination, getPaginationMetadata } = require("./utils/pagination");
const { buildExecutionFilters } = require("./utils/executionFilters");
const { validateExecutionQuery } = require("./utils/validateExecutionQuery");
const { buildErrorResponse } = require("../../shared/utils/errorResponse");
const {
  accessControlJoins,
  accessControlConditions,
} = require("./utils/accessControl");

const router = express.Router();

router.get("/executions", requireAuth, async (req, res) => {
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
    const { page, limit, offset } = getPagination(req.query);

    const baseValues = [userId];

    const { filterSql, values: filterValues } = buildExecutionFilters(
      req.query,
      baseValues,
    );

    const countResult = await pool.query(
      `SELECT
        COUNT(*)::INT AS total
      FROM audit_portal.v_execution_dashboard_web v
      ${accessControlJoins("v")}
      WHERE ${accessControlConditions("$1")}
        ${filterSql};`,
      filterValues,
    );

    const total = countResult.rows[0].total;

    const sortDirection = req.query.sortOrder === "oldest" ? "ASC" : "DESC";

    const limitParam = filterValues.length + 1;
    const offsetParam = filterValues.length + 2;

    const result = await pool.query(
      `SELECT
        v.execution_id,
        v.process_code,
        v.process_name,
        v.workflow_name,
        v.raw_status,
        v.display_status,
        v.source_reference,
        v.created_at_mx,
        v.completed_at_mx,
        v.updated_at_mx,
        v.duration_ms,
        v.total_events,
        v.error_events,
        v.total_transactions,
        v.error_transactions,
        v.total_approvals,
        v.total_subjects,
        subjects.related_documents,
        v.error_message
      FROM audit_portal.v_execution_dashboard_web v
      ${accessControlJoins("v")}
      LEFT JOIN LATERAL (
        SELECT
          COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'id', s.id,
                'subjectType', s.subject_type,
                'displaySubjectType', s.display_subject_type,
                'subjectRole', s.subject_role,
                'displaySubjectRole', s.display_subject_role,
                'subjectKey', s.subject_key,
                'sourceSystem', s.source_system,
                'displayName', s.display_name,
                'createdAtMx', s.created_at_mx
              )
              ORDER BY s.created_at_mx, s.id
            ),
            '[]'::jsonb
          ) AS related_documents
        FROM audit_portal.v_execution_subjects_web s
        WHERE s.execution_id = v.execution_id
          AND s.process_code = v.process_code
      ) subjects ON TRUE
      WHERE ${accessControlConditions("$1")}
        ${filterSql}
      ORDER BY v.created_at_mx ${sortDirection}
      LIMIT $${limitParam}
      OFFSET $${offsetParam};`,
      [...filterValues, limit, offset],
    );

    res.json({
      success: true,
      data: result.rows,
      pagination: getPaginationMetadata({
        page,
        limit,
        total,
      }),
      filters: {
        status: req.query.status || null,
        processCode: req.query.processCode || null,
        dateFrom: req.query.dateFrom || null,
        dateTo: req.query.dateTo || null,
        search: req.query.search || null,
      },
    });
  } catch (error) {
    res
      .status(500)
      .json(buildErrorResponse("Error al consultar las ejecuciones", error));
  }
});

router.get("/executions/:executionId", requireAuth, async (req, res) => {
  try {
    const { executionId } = req.params;
    const userId = req.user.userId;

    const result = await pool.query(
      ` SELECT
            v.execution_id,
            v.process_code,
            v.process_name,
            v.workflow_name,
            v.raw_status,
            v.display_status,
            v.source_reference,
            v.created_at_mx,
            v.completed_at_mx,
            v.updated_at_mx,
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
          WHERE v.execution_id = $1
            AND ${accessControlConditions("$2")}
          LIMIT 1;`,
      [executionId, userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Ejecución no encontrada o sin permisos de acceso",
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    res
      .status(500)
      .json(
        buildErrorResponse(
          "Error al consultar el detalle de la ejecución",
          error,
        ),
      );
  }
});

router.get(
  "/executions/:executionId/transactions",
  requireAuth,
  async (req, res) => {
    try {
      const { executionId } = req.params;
      const userId = req.user.userId;

      const result = await pool.query(
        `SELECT
        v.id,
        v.execution_id,
        v.process_code,
        v.process_name,
        v.system_name,
        v.operation_type,
        v.operation_name,
        v.object_type,
        v.object_key,
        v.node_name,
        v.endpoint_path,
        v.http_method,
        v.status_code,
        v.status,
        v.started_at_mx,
        v.completed_at_mx,
        v.created_at_mx,
        v.updated_at_mx,
        v.duration_ms,
        v.error_message
      FROM audit_portal.v_execution_transactions_web v
      ${accessControlJoins("v")}
      WHERE v.execution_id = $1
        AND ${accessControlConditions("$2")}
      ORDER BY
        v.created_at_mx,
        v.id;`,
        [executionId, userId],
      );

      res.json({
        success: true,
        data: result.rows,
      });
    } catch (error) {
      res
        .status(500)
        .json(
          buildErrorResponse(
            "Error al consultar las transacciones de la ejecución",
            error,
          ),
        );
    }
  },
);

router.get("/executions/:executionId/events", requireAuth, async (req, res) => {
  try {
    const { executionId } = req.params;
    const userId = req.user.userId;

    const result = await pool.query(
      `SELECT
        v.id,
        v.execution_id,
        v.process_code,
        v.process_name,
        v.event_order,
        v.event_type,
        v.event_name,
        v.node_name,
        v.status,
        v.event_level,
        v.started_at_mx,
        v.completed_at_mx,
        v.created_at_mx,
        v.updated_at_mx,
        v.duration_ms,
        v.error_message,
        v.has_error
      FROM audit_portal.v_execution_events_web v
      ${accessControlJoins("v")}
      WHERE v.execution_id = $1
        AND ${accessControlConditions("$2")}
      ORDER BY
        COALESCE(v.event_order, v.id),
        v.created_at_mx;`,
      [executionId, userId],
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    res
      .status(500)
      .json(
        buildErrorResponse(
          "Error al consultar los eventos de la ejecución",
          error,
        ),
      );
  }
});

router.get(
  "/executions/:executionId/approvals",
  requireAuth,
  async (req, res) => {
    try {
      const { executionId } = req.params;
      const userId = req.user.userId;

      const result = await pool.query(
        `SELECT
        v.id,
        v.execution_id,
        v.process_code,
        v.process_name,
        v.node_name,
        v.approval_type,
        v.approval_channel,
        v.approval_status,
        v.display_approval_status,
        v.approved,
        v.approved_by,
        v.requested_to,
        v.requested_at_mx,
        v.responded_at_mx,
        v.approval_date_mx,
        v.updated_at_mx,
        v.response_duration_ms,
        v.comments
      FROM audit_portal.v_execution_approvals_web v
      ${accessControlJoins("v")}
      WHERE v.execution_id = $1
        AND ${accessControlConditions("$2")}
      ORDER BY
        v.requested_at_mx,
        v.id;`,
        [executionId, userId],
      );

      res.json({
        success: true,
        data: result.rows,
      });
    } catch (error) {
      res
        .status(500)
        .json(
          buildErrorResponse(
            "Error al consultar las aprobaciones de la ejecución",
            error,
          ),
        );
    }
  },
);

router.get(
  "/executions/:executionId/subjects",
  requireAuth,
  async (req, res) => {
    try {
      const { executionId } = req.params;
      const userId = req.user.userId;

      const result = await pool.query(
        `SELECT
        v.id,
        v.execution_id,
        v.process_code,
        v.process_name,
        v.subject_type,
        v.display_subject_type,
        v.subject_role,
        v.display_subject_role,
        v.subject_key,
        v.source_system,
        v.display_name,
        v.created_at_mx
      FROM audit_portal.v_execution_subjects_web v
      ${accessControlJoins("v")}
      WHERE v.execution_id = $1
        AND ${accessControlConditions("$2")}
      ORDER BY
        v.created_at_mx,
        v.id;`,
        [executionId, userId],
      );

      res.json({
        success: true,
        data: result.rows,
      });
    } catch (error) {
      res
        .status(500)
        .json(
          buildErrorResponse(
            "Error al consultar los documentos relacionados de la ejecución",
            error,
          ),
        );
    }
  },
);

module.exports = router;
