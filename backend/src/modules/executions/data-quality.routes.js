const express = require("express");
const pool = require("../../shared/db/pool");
const { requireAuth } = require("../../shared/middlewares/auth.middleware");
const { buildErrorResponse } = require("../../shared/utils/errorResponse");

const router = express.Router();

router.get("/data-quality", requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;

    const result = await pool.query(
      `
      WITH accessible_processes AS (
        SELECT process_code
        FROM audit_portal.v_user_process_access_effective
        WHERE user_id = $1
      ),
      -- La lista es fija a propósito. Las seis reglas de detección viven en
      -- v_data_quality_issues_web, que devuelve una fila por incidencia; sin
      -- esta lista, un tipo sin incidencias desaparecería de la respuesta en
      -- vez de salir con total = 0, que es lo que el endpoint devuelve hoy.
      tipos (issue_type) AS (
        VALUES
          ('workflow_execution_without_process_code'),
          ('workflow_execution_process_code_desconocido'),
          ('workflow_execution_undefined_execution_id'),
          ('workflow_execution_started_without_close_30min'),
          ('workflow_execution_error_without_message'),
          ('workflow_events_error_without_message')
      )
      -- El filtro por proceso accesible se queda aquí y no en la vista: este
      -- endpoint solo lleva requireAuth, así que ESTE cruce es su control de
      -- acceso y tiene que aplicarse antes de contar. Es también la razón por la
      -- que no se puede consumir audit_portal.v_audit_data_quality, que entrega
      -- los conteos ya agregados y sin filtrar.
      --
      -- requires_access = FALSE son las ejecuciones huérfanas (sin process_code
      -- o con uno fuera del catálogo): no se filtran porque no hay proceso al
      -- que atribuirlas, y cruzarlas daría 0 siempre.
      SELECT
        t.issue_type,
        COUNT(q.issue_type)::INT AS total
      FROM tipos t
      LEFT JOIN audit_portal.v_data_quality_issues_web q
        ON q.issue_type = t.issue_type
       AND (
         NOT q.requires_access
         OR q.process_code IN (SELECT process_code FROM accessible_processes)
       )
      GROUP BY t.issue_type
      ORDER BY t.issue_type;
      `,
      [userId],
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    res
      .status(500)
      .json(
        buildErrorResponse("Error al consultar la calidad de datos", error),
      );
  }
});

module.exports = router;
