-- ============================================================
-- ESQUEMA: material_revaluations
-- Fecha: 2026-08-06
--
-- Esquema propio del proceso de revaluación de material. Hasta ahora era el
-- único de los cuatro procesos de negocio sin uno (payments, maintenance e
-- international_purchases ya lo tenían).
--
-- ALCANCE — leer antes de tocar nada:
--   Aquí viven los OBJETOS del proceso, no sus DATOS. Los registros de
--   revaluaciones (62 ejecuciones, 319 eventos, 40 aprobaciones, 243
--   transacciones y 70 sujetos, medidos el 06/08/2026) siguen en audit.workflow_*
--   y NO se pueden mover: las cinco vistas audit_portal.v_execution_* no filtran
--   por proceso —sirven a todos a la vez— y el módulo executions (Logs, LogDetail,
--   Dashboard) los lista juntos. Sacarlos exigiría reescribir ese módulo y los
--   nodos de auditoría del workflow de n8n.
--
-- ⚠️  product_locks y n8n:
--   Los nodos "Acquire Product Locks" y "Release Product Locks" del workflow
--   MaterialRevaluationTesting - Portal Webhook llevan CADA UNO un
--   CREATE TABLE IF NOT EXISTS de esta tabla. Si el nombre de aquí y el del
--   workflow divergen, n8n recrea la tabla en el esquema viejo y el proceso queda
--   partido en dos sin error visible. Al renombrarla o moverla, editar los dos
--   nodos en el mismo despliegue.
-- ============================================================

CREATE SCHEMA IF NOT EXISTS material_revaluations;
GRANT USAGE ON SCHEMA material_revaluations TO audit_web_reader;

-- ─── Tablas ──────────────────────────────────────────────────

-- Candado por producto+almacén para que dos revaluaciones simultáneas no pisen
-- el mismo material. La escribe y la libera el workflow de n8n; el backend del
-- portal no la consulta nunca.
CREATE TABLE IF NOT EXISTS material_revaluations.product_locks (
  lock_key       TEXT PRIMARY KEY,
  item_code      TEXT NOT NULL,
  warehouse_code TEXT NOT NULL,
  execution_id   TEXT NOT NULL,
  acquired_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at     TIMESTAMPTZ NOT NULL,
  status         TEXT NOT NULL DEFAULT 'LOCKED'
);

CREATE INDEX IF NOT EXISTS idx_product_locks_execution_id
  ON material_revaluations.product_locks (execution_id);
CREATE INDEX IF NOT EXISTS idx_product_locks_expires_at
  ON material_revaluations.product_locks (expires_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON material_revaluations.product_locks TO audit_web_reader;

-- ─── Vistas ──────────────────────────────────────────────────

-- Payloads de revisión de una ejecución, por prioridad: primero el de la
-- aprobación, y si no hay, el del evento que lo lleve.
CREATE OR REPLACE VIEW material_revaluations.v_review_web AS
SELECT execution_id, payload, created_at, priority
  FROM (
    SELECT a.execution_id,
           a.request_payload AS payload,
           a.requested_at AS created_at,
           1 AS priority
      FROM audit.workflow_approvals a
      JOIN audit.workflow_execution we ON we.execution_id::text = a.execution_id::text
     WHERE we.process_code = 'material_revaluation'::text
       AND a.request_payload IS NOT NULL
    UNION ALL
    SELECT e.execution_id,
           e.payload,
           e.created_at,
           2 AS priority
      FROM audit.workflow_events e
      JOIN audit.workflow_execution we ON we.execution_id::text = e.execution_id::text
     WHERE we.process_code = 'material_revaluation'::text
       AND e.payload IS NOT NULL
       AND (e.payload ? 'productosRevaluados'::text
            OR e.payload ? 'revaluaciones'::text
            OR e.payload ? 'data'::text)
  ) payloads;

GRANT SELECT ON material_revaluations.v_review_web TO audit_web_reader;

-- Revaluaciones pendientes de revisar.
--
-- El gate de acceso NO está aquí a propósito: esta vista expone las filas
-- pendientes sin filtro de usuario, y el router se une a
-- audit_portal.v_user_process_access_effective para filtrar por user_id y tomar
-- can_export. Así el control de acceso se lee en el router y no queda escondido
-- dentro de una vista. Mismo criterio que en /data-quality.
CREATE OR REPLACE VIEW material_revaluations.v_pending_web AS
WITH latest_payload AS (
  SELECT r.execution_id,
         r.payload,
         ROW_NUMBER() OVER (
           PARTITION BY r.execution_id
           ORDER BY r.priority ASC, r.created_at DESC
         ) AS row_number
    FROM material_revaluations.v_review_web r
)
SELECT d.execution_id,
       d.process_code,
       COALESCE(d.process_name, a.process_name, 'Revaluacion de inventario') AS process_name,
       d.source_reference,
       d.created_at_mx,
       a.id AS approval_id,
       a.requested_at_mx AS requested_at,
       a.requested_to,
       p.payload AS request_payload
  FROM audit_portal.v_execution_approvals_web a
  INNER JOIN audit_portal.v_execution_dashboard_web d
    ON d.execution_id::TEXT = a.execution_id::TEXT
  INNER JOIN latest_payload p
    ON p.execution_id::TEXT = a.execution_id::TEXT
   AND p.row_number = 1
 WHERE d.process_code = 'material_revaluation'
   AND a.approval_status = 'PENDING'
   AND p.payload IS NOT NULL;

GRANT SELECT ON material_revaluations.v_pending_web TO audit_web_reader;

-- Dashboard · aprobaciones. El umbral de 24 h queda fijado aquí; requested_at_mx
-- es timestamp SIN zona (la vista de origen ya lo convirtió), así que el
-- AT TIME ZONE explícito es obligatorio, no cosmético.
CREATE OR REPLACE VIEW material_revaluations.v_dashboard_approvals_web AS
SELECT
  COUNT(*)::INT AS total,
  COUNT(*) FILTER (WHERE a.display_approval_status = 'PENDIENTE')::INT AS pendientes,
  COUNT(*) FILTER (WHERE a.display_approval_status = 'APROBADO')::INT AS aprobadas,
  COUNT(*) FILTER (WHERE a.display_approval_status = 'RECHAZADO')::INT AS rechazadas,
  COUNT(*) FILTER (
    WHERE a.display_approval_status = 'PENDIENTE'
      AND a.requested_at_mx <
        (now() AT TIME ZONE 'America/Mexico_City') - (24 * INTERVAL '1 hour')
  )::INT AS pendientes_mas_24h,
  COALESCE(
    percentile_cont(0.5) WITHIN GROUP (ORDER BY a.response_duration_ms::float8), 0
  )::BIGINT AS p50_respuesta_ms,
  COALESCE(
    percentile_cont(0.9) WITHIN GROUP (ORDER BY a.response_duration_ms::float8), 0
  )::BIGINT AS p90_respuesta_ms
FROM audit_portal.v_execution_approvals_web a
WHERE a.process_code = 'material_revaluation';

GRANT SELECT ON material_revaluations.v_dashboard_approvals_web TO audit_web_reader;

-- Dashboard · ejecuciones.
CREATE OR REPLACE VIEW material_revaluations.v_dashboard_executions_web AS
SELECT
  COUNT(*)::INT AS total,
  COUNT(*) FILTER (WHERE v.display_status = 'EXITOSA')::INT AS exitosas,
  COUNT(*) FILTER (WHERE v.display_status = 'ERROR')::INT AS con_error,
  COUNT(*) FILTER (WHERE v.display_status = 'INCOMPLETA')::INT AS incompletas
FROM audit_portal.v_execution_dashboard_web v
WHERE v.process_code = 'material_revaluation';

GRANT SELECT ON material_revaluations.v_dashboard_executions_web TO audit_web_reader;

-- Dashboard · revisores más activos. El LIMIT se queda en el router: es cuántos
-- caben en la tarjeta, no un dato.
CREATE OR REPLACE VIEW material_revaluations.v_dashboard_reviewers_web AS
SELECT
  COALESCE(NULLIF(btrim(a.approved_by), ''), '(sin registrar)') AS approved_by,
  COUNT(*)::INT AS total
FROM audit_portal.v_execution_approvals_web a
WHERE a.process_code = 'material_revaluation'
  AND a.display_approval_status <> 'PENDIENTE'
GROUP BY 1;

GRANT SELECT ON material_revaluations.v_dashboard_reviewers_web TO audit_web_reader;
