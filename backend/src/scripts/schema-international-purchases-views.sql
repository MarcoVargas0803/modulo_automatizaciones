-- ============================================================================
-- schema-international-purchases-views.sql
--
-- DDL de la cadena de vistas del listado de embarques. Hasta ahora no estaba en
-- Git: se aplicaba a mano en cada entorno. Eso costo una caida en produccion.
--
-- QUE PASO (07/08/2026)
-- ---------------------
-- El commit 9132f8c ("refactor: ampliar la vista de embarques y quitar el JOIN
-- extra a shipments") toco DOS archivos: el router y un .md. Cero SQL. El
-- "ampliar la vista" del titulo se hizo a mano en la base de desarrollo.
--
-- Ese commit quito el `JOIN international_purchases.shipments s` del listado y
-- movio 11 columnas de `s.` a `v.`. Al desplegarse en produccion, donde la vista
-- seguia teniendo 27 columnas en vez de 37:
--
--   GET /api/international-purchases/shipments  ->  500 en TODA peticion
--   ERROR: column v.review_status does not exist  (SQLSTATE 42703)
--
-- Fallaba incluso el COUNT(*), porque el listado siempre inyecta el filtro
-- `v.review_status <> 'DISCARDED'` (international-purchases.routes.js:511).
-- Y era invisible: buildErrorResponse oculta error.message en produccion y ese
-- catch no tiene console.error, asi que el 42703 no aparecia ni en la respuesta
-- ni en los logs.
--
-- LA CADENA (dos niveles, no uno)
-- -------------------------------
--   audit_portal.v_international_purchases_shipments_web   <- solo suma process_code
--     └─ international_purchases.v_shipments_portal         <- deriva primary_reference_*,
--          └─ international_purchases.shipments                eta_status, days_to_eta
--
-- ORDEN OBLIGATORIO: de dentro hacia fuera. La fachada no puede exponer una
-- columna que su vista interna no tenga.
--
-- POR QUE `CREATE OR REPLACE` Y NO `DROP` + `CREATE`
-- -------------------------------------------------
--   * DROP VIEW pierde los GRANT. audit_web_reader se quedaria sin SELECT y el
--     500 se convertiria en un 42501. Los GRANT del final son un cinturon, no
--     el mecanismo.
--   * DROP VIEW de la interna exige CASCADE (la fachada y
--     v_active_shipments_for_tracking dependen de ella), y CASCADE se llevaria
--     por delante el tracking de n8n.
--   * CREATE OR REPLACE solo puede AÑADIR columnas al final: no reordena, no
--     renombra, no quita. Por eso las 10 nuevas van al final y en este orden
--     exacto -- es el mismo con el que quedaron en dev. Si la vista de destino
--     difiere en alguna de las primeras 26 columnas, el comando FALLA en voz
--     alta ("cannot change name of view column ...") y la transaccion no deja
--     nada a medias. Ese fallo es informacion, no un accidente.
--
-- LA COLUMNA `bl` SIGUE VIVA A PROPOSITO
-- --------------------------------------
-- El router ya no la nombra (Paso A, commit 4c18ca7) pero las vistas SI: los
-- CASE de primary_reference_type y primary_reference_value la leen. No quitarla
-- de aqui hasta ejecutar el Paso B del Bloque 4 de
-- schema-international-purchases-invites.sql, que recrea las tres vistas SIN
-- `bl` antes del DROP COLUMN.
--
-- IDEMPOTENTE: se puede correr N veces. Aplicado sobre dev no cambia nada.
--
--   psql -h <host> -U <owner> -d <base> -f schema-international-purchases-views.sql
--
-- Correr como el OWNER de las vistas (n8n), no como audit_web_reader: una vista
-- ejecuta con los privilegios de su owner, y ahi esta el acceso a la tabla base.
-- ============================================================================

BEGIN;


-- ============================================================
-- PREFLIGHT — la tabla base tiene que tener las 10 columnas
-- ============================================================
--
-- review_status, reviewed_by y reviewed_at NO son originales de shipments: las
-- añade el BLOQUE 2 de schema-international-purchases-invites.sql. Si ese script
-- no se aplico en este entorno, no existen ni en la tabla, y recrear la vista
-- fallaria con el mismo 42703 un nivel mas abajo -- justo el error que este
-- archivo viene a cerrar.
--
-- Se aborta con un mensaje que dice que correr, en vez de reventar con un
-- "column does not exist" que no apunta a la causa.

DO $preflight$
DECLARE
    faltantes text;
BEGIN
    SELECT string_agg(c.nombre, ', ' ORDER BY c.nombre)
      INTO faltantes
      FROM (VALUES
              ('supplier_name'), ('invoice_code'),
              ('review_status'), ('reviewed_by'), ('reviewed_at'),
              ('warnings'), ('last_tracking_error'), ('last_tracking_error_at'),
              ('custom_fields'), ('shipment_type'),
              ('bl'), ('updated_at')
           ) AS c(nombre)
     WHERE NOT EXISTS (
              SELECT 1
                FROM information_schema.columns
               WHERE table_schema = 'international_purchases'
                 AND table_name   = 'shipments'
                 AND column_name  = c.nombre
           );

    IF faltantes IS NOT NULL THEN
        RAISE EXCEPTION
            'ABORTADO: international_purchases.shipments no tiene estas columnas: %. '
            'Las de revision las crea el BLOQUE 2 de '
            'schema-international-purchases-invites.sql -- aplicarlo antes que este script.',
            faltantes;
    END IF;

    RAISE NOTICE 'Preflight OK: las 12 columnas existen en international_purchases.shipments.';
END $preflight$;


-- ============================================================
-- NIVEL 1 — international_purchases.v_shipments_portal
-- ============================================================
--
-- Las 26 primeras columnas son las historicas y su orden es intocable (ver la
-- nota de CREATE OR REPLACE en la cabecera). Las 10 ultimas son las que 9132f8c
-- dio por hechas.

CREATE OR REPLACE VIEW international_purchases.v_shipments_portal AS
SELECT
    shipment_id,
    tracking_key,
    tracking_reference_type,
    bl,
    tracking_provider_type,
    tracking_provider_name,
    scac,
    carrier,
    agency,
    material_description,
    container_count,
    terminal,
    etd,
    eta,
    atd,
    ata,
    shipment_status,
    source_type,
    tracking_enabled,
    portal_created_by,
    portal_notes,

    -- Referencia efectiva del embarque. Prefiere tracking_reference_type (hoy
    -- siempre 'MBL' por CHECK) y cae a la columna espejo bl en las filas
    -- heredadas que solo tenian esa.
    CASE
        WHEN tracking_reference_type IS NOT NULL THEN tracking_reference_type
        WHEN NULLIF(btrim(bl), ''::text) IS NOT NULL THEN 'BL'::text
        ELSE NULL::text
    END AS primary_reference_type,
    CASE
        WHEN NULLIF(btrim(tracking_key), ''::text) IS NOT NULL THEN tracking_key
        WHEN NULLIF(btrim(bl), ''::text) IS NOT NULL THEN bl
        ELSE NULL::text
    END AS primary_reference_value,

    -- Semaforo de ETA. Se calcula aqui y no en el frontend para que el listado,
    -- el dashboard y cualquier export cuenten lo mismo.
    CASE
        WHEN eta IS NULL THEN 'SIN_ETA'::text
        WHEN eta < CURRENT_DATE THEN 'ETA_VENCIDA'::text
        WHEN eta = CURRENT_DATE THEN 'ETA_HOY'::text
        WHEN eta <= (CURRENT_DATE + '7 days'::interval) THEN 'ETA_PROXIMA'::text
        ELSE 'ETA_FUTURA'::text
    END AS eta_status,
    CASE
        WHEN eta IS NULL THEN NULL::integer
        ELSE eta - CURRENT_DATE
    END AS days_to_eta,

    updated_at,

    -- --- Las 10 que faltaban en produccion (9132f8c) ---
    supplier_name,
    invoice_code,
    review_status,
    reviewed_by,
    reviewed_at,
    warnings,
    last_tracking_error,
    last_tracking_error_at,
    custom_fields,
    shipment_type
FROM international_purchases.shipments s;


-- ============================================================
-- NIVEL 2 — audit_portal.v_international_purchases_shipments_web
-- ============================================================
--
-- Esta fachada solo añade la constante process_code y repite la lista entera de
-- la vista interna. Es la deuda anotada en
-- .claude/conventions/backend-specific-rules/deuda-abierta.md ("la fachada de
-- embarques copia 36 columnas"): exponer una columna nueva obliga a editar los
-- dos niveles, en este orden. No replicar el patron en modulos nuevos.

CREATE OR REPLACE VIEW audit_portal.v_international_purchases_shipments_web AS
SELECT
    'international_purchases'::text AS process_code,
    shipment_id,
    tracking_key,
    tracking_reference_type,
    bl,
    tracking_provider_type,
    tracking_provider_name,
    scac,
    carrier,
    agency,
    material_description,
    container_count,
    terminal,
    etd,
    eta,
    atd,
    ata,
    shipment_status,
    source_type,
    tracking_enabled,
    portal_created_by,
    portal_notes,
    primary_reference_type,
    primary_reference_value,
    eta_status,
    days_to_eta,
    updated_at,

    -- --- Las 10 que faltaban en produccion (9132f8c) ---
    supplier_name,
    invoice_code,
    review_status,
    reviewed_by,
    reviewed_at,
    warnings,
    last_tracking_error,
    last_tracking_error_at,
    custom_fields,
    shipment_type
FROM international_purchases.v_shipments_portal;


-- ============================================================
-- GRANT — cinturon, no mecanismo
-- ============================================================
--
-- CREATE OR REPLACE conserva los privilegios existentes, asi que estos GRANT no
-- deberian hacer falta. Se dejan para que el script sirva tambien en un entorno
-- nuevo, y porque un GRANT repetido no tiene coste.

GRANT SELECT ON international_purchases.v_shipments_portal
    TO audit_web_reader;
GRANT SELECT ON audit_portal.v_international_purchases_shipments_web
    TO audit_web_reader;


COMMIT;


-- ============================================================
-- VERIFICACION — correr despues, y antes de dar por buena la caida
-- ============================================================
--
-- 1) Conteo de columnas. Tienen que dar 36 y 37.
--
--   SELECT table_schema, table_name, count(*) AS cols
--     FROM information_schema.columns
--    WHERE (table_schema, table_name) IN (
--            ('international_purchases', 'v_shipments_portal'),
--            ('audit_portal', 'v_international_purchases_shipments_web'))
--    GROUP BY 1, 2;
--
-- 2) La consulta que reventaba, con el filtro real del listado:
--
--   SELECT count(*)
--     FROM audit_portal.v_international_purchases_shipments_web v
--    WHERE v.review_status <> 'DISCARDED';
--
-- 3) Lo mismo COMO audit_web_reader, que es quien lo corre de verdad. El paso 2
--    pasa siendo owner aunque falte el GRANT:
--
--   SET ROLE audit_web_reader;
--   SELECT v.review_status, v.supplier_name, v.shipment_type
--     FROM audit_portal.v_international_purchases_shipments_web v LIMIT 1;
--   RESET ROLE;
--
-- 4) Y el tracking de n8n, que cuelga de la vista interna y no se toco:
--
--   SELECT count(*) FROM international_purchases.v_active_shipments_for_tracking;
