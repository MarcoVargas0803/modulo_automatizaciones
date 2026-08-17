-- ============================================================
-- Autenticación contra SAP + usuario de pruebas
-- Fecha: 2026-08-14
--
-- Antes se llamaba `Cambios_conexion_SAP.sql`, fuera de toda convención de
-- nombres y con un INSERT que reventaba al ejecutarlo dos veces. Renombrado
-- para seguir el patrón de `schema-auth-sessions.sql`.
--
-- Qué hace:
--   1. `auth_source` en audit_portal.users: permite que un usuario se valide
--      contra SAP en vez de contra el hash local.
--   2. Da de alta al usuario de pruebas `pIA` y sus accesos.
--
-- Idempotente: puede ejecutarse varias veces sin efecto acumulativo.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Origen de autenticación
-- ------------------------------------------------------------
ALTER TABLE audit_portal.users
  ADD COLUMN IF NOT EXISTS auth_source text NOT NULL DEFAULT 'local'
  CHECK (auth_source IN ('local','sap'));

COMMENT ON COLUMN audit_portal.users.auth_source IS
  'Contra qué se valida la contraseña: «local» usa password_hash, «sap» delega '
  'en el Service Layer. Un usuario «sap» lleva un centinela en password_hash '
  'que no corresponde a ninguna contraseña real.';

-- ------------------------------------------------------------
-- 2. Usuario de pruebas
-- ------------------------------------------------------------
-- ON CONFLICT porque el original no lo tenía: una segunda ejecución fallaba
-- con violación de la clave única de username y abortaba el resto del script.
INSERT INTO audit_portal.users (username, display_name, password_hash, auth_source, is_active)
VALUES ('pIA', 'Pruebas SAP', 'SAP-AUTH-NO-LOCAL-PASSWORD', 'sap', true)
ON CONFLICT (username) DO UPDATE
  SET auth_source = EXCLUDED.auth_source,
      is_active   = EXCLUDED.is_active;

-- El rol de mantenimiento es 'jefe', no 'encargado': la migración 006 retiró
-- ese vocabulario. Dejarlo como estaba daría acceso al proceso pero ningún
-- gate de rol lo reconocería, así que el usuario vería 403 en todo el módulo.
INSERT INTO audit_portal.user_process_access (user_id, process_code, can_view, can_export, role)
SELECT u.user_id, x.process_code, true, true, x.role
FROM audit_portal.users u
CROSS JOIN (VALUES
  ('admin',                   NULL::text),
  ('international_purchases', NULL),
  ('material_revaluation',    NULL),
  ('payments',                NULL),
  ('purchasing',              NULL),
  ('maintenance',             'jefe')
) AS x(process_code, role)
WHERE u.username = 'pIA'
ON CONFLICT (user_id, process_code) DO UPDATE
  SET can_view = EXCLUDED.can_view,
      can_export = EXCLUDED.can_export,
      role = EXCLUDED.role;

COMMIT;

-- ============================================================
-- Verificación
-- ============================================================
SELECT u.username, u.auth_source, upa.process_code, upa.role
FROM audit_portal.users u
JOIN audit_portal.user_process_access upa ON upa.user_id = u.user_id
WHERE u.username = 'pIA'
ORDER BY upa.process_code;
