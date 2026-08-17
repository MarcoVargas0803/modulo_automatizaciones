-- ============================================================================
-- schema-international-purchases-indicators.sql
--
-- Seis vistas nuevas de indicadores para el bloque de compras internacionales
-- del Dashboard General, mas la vista base que las alimenta.
--
-- POR QUE EXISTE
-- --------------
-- El modulo guarda el payload completo de SafeCube en
-- shipment_tracking_history.raw_tracking_payload (jsonb) y no lo lee nadie: de
-- todo el JSON -- ruta con puertos y coordenadas, buque, contenedores y sus
-- eventos -- el proceso solo materializa CUATRO fechas en columnas (etd, eta,
-- atd, ata). Estas vistas explotan lo que ya esta guardado, sin ALTER TABLE ni
-- cambios en el workflow de n8n.
--
-- DDL EN EL MISMO PR QUE EL CODIGO QUE LO CONSUME. Es la regla que dejo
-- schema-international-purchases-scac-catalog.sql como referencia, y cuyo
-- incumplimiento causo la caida del 07/08/2026 documentada en
-- schema-international-purchases-views.sql.
--
-- LA CADENA
-- ---------
--   audit_portal.v_international_purchases_shipments_web   <- fachada, 37 cols
--     └─ international_purchases.v_shipments_portal
--          └─ international_purchases.shipments
--
-- Las cinco vistas de cobertura 100% cuelgan de la FACHADA, igual que las seis
-- vistas de dashboard que ya existian, no de la tabla base. Asi heredan el
-- mismo origen que el listado de la pantalla.
--
-- COBERTURA PARCIAL DE LAS VISTAS DE RUTA -- LEER ANTES DE INTERPRETARLAS
-- ----------------------------------------------------------------------
-- shipment_tracking_history solo recibe una fila cuando una fecha CAMBIA (lo
-- impone tracking_history_date_changed_check). Un embarque cuyas fechas nunca
-- se movieron no tiene ninguna fila y, por tanto, no tiene payload del que
-- sacar puertos ni buque.
--
--   v_dashboard_routes_web y v_dashboard_by_port_web  ->  cobertura PARCIAL
--   las otras cuatro (columnas de shipments)          ->  cobertura TOTAL
--
-- Por eso v_dashboard_data_quality_web expone con_payload / sin_payload: es el
-- denominador con el que la UI tiene que rotular las graficas de ruta. Un "top
-- corredores" sin ese numero es un grafico parcial presentado como censo.
--
-- Para llevar la ruta al 100% hace falta shipments.last_tracking_payload jsonb
-- escrita en cada corrida de tracking. Es Fase 2 y NO esta en este script.
--
-- FILTRO DE DESCARTADOS -- INCONSISTENCIA CONOCIDA
-- ------------------------------------------------
-- Las seis vistas v_dashboard_*_web que ya existian NO filtran
-- review_status <> 'DISCARDED', pero el listado de la pantalla SI lo inyecta
-- siempre (international-purchases.routes.js). Es decir: hoy el Dashboard
-- cuenta embarques descartados que el listado no muestra.
--
-- Las vistas de ESTE script si lo filtran, porque nacer con el bug seria
-- perpetuarlo. Consecuencia deliberada: los nuevos indicadores pueden no cuadrar
-- con los viejos si hay descartados. Corregir las seis viejas es una decision
-- aparte -- cambiaria numeros que el Dashboard ya muestra hoy -- y no se toma
-- aqui de forma unilateral.
--
-- IDEMPOTENTE: se puede correr N veces. Solo CREATE OR REPLACE y GRANT.
--
--   psql -h <host> -U <owner> -d <base> -f schema-international-purchases-indicators.sql
--
-- Correr como el OWNER de las vistas (n8n), no como audit_web_reader: una vista
-- ejecuta con los privilegios de su owner, y ahi esta el acceso a la tabla base.
-- ============================================================================

BEGIN;


-- ============================================================
-- PREFLIGHT — la fachada tiene que existir y traer sus 37 columnas
-- ============================================================
--
-- Las seis vistas de abajo leen columnas que la fachada solo tiene despues de
-- aplicar schema-international-purchases-views.sql. Si ese script no se corrio
-- en este entorno, el CREATE fallaria con un 42703 que no apunta a la causa
-- -- exactamente el error que aquel archivo vino a cerrar.
--
-- Se aborta con un mensaje que dice que correr.

DO $preflight$
DECLARE
    faltantes text;
BEGIN
    SELECT string_agg(c.nombre, ', ' ORDER BY c.nombre)
      INTO faltantes
      FROM (VALUES
              ('review_status'), ('supplier_name'), ('container_count'),
              ('eta'), ('ata'), ('atd'), ('carrier'),
              ('tracking_enabled'), ('last_tracking_error'), ('updated_at')
           ) AS c(nombre)
     WHERE NOT EXISTS (
              SELECT 1
                FROM information_schema.columns
               WHERE table_schema = 'audit_portal'
                 AND table_name   = 'v_international_purchases_shipments_web'
                 AND column_name  = c.nombre
           );

    IF faltantes IS NOT NULL THEN
        RAISE EXCEPTION
            'ABORTADO: audit_portal.v_international_purchases_shipments_web no tiene estas '
            'columnas: %. Aplicar antes schema-international-purchases-views.sql.',
            faltantes;
    END IF;

    RAISE NOTICE 'Preflight OK: la fachada de embarques tiene las columnas necesarias.';
END $preflight$;


-- ============================================================
-- NIVEL 0 — international_purchases.v_shipment_latest_payload
-- ============================================================
--
-- La UNICA vista que conoce la forma del JSON de SafeCube. Las demas la
-- consultan como si fuera una tabla, asi que un cambio en el contrato de la API
-- se arregla en un solo sitio.
--
-- DISTINCT ON se queda con la fila mas reciente por embarque. El ORDER BY tiene
-- que empezar por shipment_id o Postgres lo rechaza; el criterio real es el
-- detected_at DESC que va detras.
--
-- Rendimiento: hoy son 228 filas y el plan es trivial. Cuando el historial
-- crezca, el indice util es uno compuesto (shipment_id, detected_at DESC) --
-- existen los dos por separado (idx_tracking_history_shipment_id y
-- idx_tracking_history_detected_at), que no es lo mismo. No se crea aqui porque
-- a este volumen seria ruido.

CREATE OR REPLACE VIEW international_purchases.v_shipment_latest_payload AS
SELECT DISTINCT ON (h.shipment_id)
    h.shipment_id,
    h.detected_at AS payload_detected_at,

    -- Puerto de carga (POL) y de descarga (POD). El locode es la clave estable
    -- (UN/LOCODE); el nombre es para mostrar y puede variar entre navieras.
    h.raw_tracking_payload -> 'route' -> 'pol' -> 'location' ->> 'locode'      AS pol_locode,
    h.raw_tracking_payload -> 'route' -> 'pol' -> 'location' ->> 'name'        AS pol_name,
    h.raw_tracking_payload -> 'route' -> 'pol' -> 'location' ->> 'country'     AS pol_country,
    h.raw_tracking_payload -> 'route' -> 'pol' -> 'location' ->> 'countryCode' AS pol_country_code,

    h.raw_tracking_payload -> 'route' -> 'pod' -> 'location' ->> 'locode'      AS pod_locode,
    h.raw_tracking_payload -> 'route' -> 'pod' -> 'location' ->> 'name'        AS pod_name,
    h.raw_tracking_payload -> 'route' -> 'pod' -> 'location' ->> 'country'     AS pod_country,
    h.raw_tracking_payload -> 'route' -> 'pod' -> 'location' ->> 'countryCode' AS pod_country_code,

    -- Naviera segun la API, que no siempre coincide con shipments.carrier: ese
    -- lo escribe quien registra el embarque, este lo dice el proveedor.
    h.raw_tracking_payload -> 'metadata' ->> 'sealine'        AS sealine,
    h.raw_tracking_payload -> 'metadata' ->> 'sealineName'    AS sealine_name,
    h.raw_tracking_payload -> 'metadata' ->> 'shippingStatus' AS api_status,

    -- Buque de la ultima posicion AIS conocida.
    h.raw_tracking_payload -> 'routeData' -> 'ais' -> 'data' -> 'vessel' ->> 'name' AS vessel_name,
    h.raw_tracking_payload -> 'routeData' -> 'ais' -> 'data' -> 'vessel' ->> 'imo'  AS vessel_imo,

    -- Contenedores que reporto la naviera. NO sustituye a shipments.container_count
    -- (que es el dato del negocio); sirve para detectar discrepancias.
    jsonb_array_length(
        COALESCE(h.raw_tracking_payload -> 'containers', '[]'::jsonb)
    ) AS containers_en_payload
FROM international_purchases.shipment_tracking_history h
WHERE h.raw_tracking_payload IS NOT NULL
ORDER BY h.shipment_id, h.detected_at DESC;


-- ============================================================
-- NIVEL 1 — Puntualidad (cobertura total)
-- ============================================================
--
-- Una sola fila, como v_dashboard_totals_web: las cuatro cubetas son un juego
-- fijo, asi que van como columnas y no como filas. El frontend arma la serie de
-- la grafica en el orden que quiere mostrar.
--
-- Los umbrales (0 / 3 / 7 dias) viven AQUI y no en el router, igual que la
-- ventana de 30 dias de v_dashboard_tracking_activity_web. Si cambia la
-- definicion de "a tiempo", se cambia en un solo sitio.
--
-- "A tiempo" es ata <= eta: llegar antes cuenta como a tiempo. Solo entran
-- embarques ARRIBADOS y con ETA para comparar; el resto no es un retraso de
-- cero, es un dato que todavia no existe.

CREATE OR REPLACE VIEW international_purchases.v_dashboard_punctuality_web AS
WITH arribados AS (
    SELECT (s.ata - s.eta) AS retraso_dias
    FROM audit_portal.v_international_purchases_shipments_web s
    WHERE s.review_status <> 'DISCARDED'
      AND s.ata IS NOT NULL
      AND s.eta IS NOT NULL
)
SELECT
    (count(*))::integer                                                  AS medidos,
    (count(*) FILTER (WHERE retraso_dias <= 0))::integer                 AS a_tiempo,
    (count(*) FILTER (WHERE retraso_dias BETWEEN 1 AND 3))::integer      AS retraso_1_3,
    (count(*) FILTER (WHERE retraso_dias BETWEEN 4 AND 7))::integer      AS retraso_4_7,
    (count(*) FILTER (WHERE retraso_dias > 7))::integer                  AS retraso_mas_7,

    -- NULLIF evita la division por cero cuando todavia no arribo nada.
    round(
        (count(*) FILTER (WHERE retraso_dias <= 0)) * 100.0
        / NULLIF(count(*), 0)
    , 1) AS pct_a_tiempo,

    round(avg(retraso_dias), 1)                                          AS retraso_promedio,
    round(
        (percentile_cont(0.5) WITHIN GROUP (ORDER BY retraso_dias))::numeric
    , 1) AS retraso_mediana
FROM arribados;


-- ============================================================
-- NIVEL 1 — Puntualidad por proveedor (cobertura total)
-- ============================================================
--
-- Responde "que proveedor llega tarde", que hoy no se puede contestar en toda
-- la aplicacion. Alimenta una tabla, no una grafica: son cinco columnas por
-- fila y una barra solo mostraria una.
--
-- `total` cuenta todos los embarques del proveedor y `arribados` solo los que ya
-- llegaron: la desviacion se calcula sobre los segundos, asi que las dos cifras
-- tienen que verse juntas para que el promedio no enganie.

CREATE OR REPLACE VIEW international_purchases.v_dashboard_punctuality_by_supplier_web AS
SELECT
    COALESCE(NULLIF(btrim(s.supplier_name), ''::text), '(sin proveedor)'::text) AS supplier_name,
    (count(*))::integer                                                AS total,
    (count(*) FILTER (WHERE s.ata IS NOT NULL))::integer               AS arribados,
    (COALESCE(sum(s.container_count), (0)::bigint))::integer           AS contenedores,

    round(
        avg(s.ata - s.eta) FILTER (WHERE s.ata IS NOT NULL AND s.eta IS NOT NULL)
    , 1) AS desviacion_dias,

    round(
        (count(*) FILTER (WHERE s.ata IS NOT NULL AND s.eta IS NOT NULL AND s.ata <= s.eta)) * 100.0
        / NULLIF(count(*) FILTER (WHERE s.ata IS NOT NULL AND s.eta IS NOT NULL), 0)
    , 1) AS pct_a_tiempo
FROM audit_portal.v_international_purchases_shipments_web s
WHERE s.review_status <> 'DISCARDED'
GROUP BY COALESCE(NULLIF(btrim(s.supplier_name), ''::text), '(sin proveedor)'::text);


-- ============================================================
-- NIVEL 1 — Transito real (cobertura total)
-- ============================================================
--
-- Dias entre salida y llegada REALES (atd -> ata), no entre las estimadas. Es
-- el numero que sirve para planear compras: cuanto tarda de verdad un embarque.
--
-- Una sola fila. La mediana acompania al promedio a proposito: con pocos
-- embarques, un solo caso extremo mueve la media y la mediana no.

CREATE OR REPLACE VIEW international_purchases.v_dashboard_transit_web AS
WITH transitos AS (
    SELECT (s.ata - s.atd) AS transito_dias
    FROM audit_portal.v_international_purchases_shipments_web s
    WHERE s.review_status <> 'DISCARDED'
      AND s.ata IS NOT NULL
      AND s.atd IS NOT NULL
      AND s.ata >= s.atd          -- descarta fechas incoherentes de la naviera
)
SELECT
    (count(*))::integer                     AS medidos,
    round(avg(transito_dias), 1)            AS transito_promedio,
    round(
        (percentile_cont(0.5) WITHIN GROUP (ORDER BY transito_dias))::numeric
    , 1) AS transito_mediana,
    (min(transito_dias))::integer           AS transito_min,
    (max(transito_dias))::integer           AS transito_max
FROM transitos;


-- ============================================================
-- NIVEL 1 — Corredores POL -> POD (COBERTURA PARCIAL)
-- ============================================================
--
-- Cuelga de v_shipment_latest_payload, asi que solo ve los embarques que
-- tuvieron al menos un cambio de fecha. El denominador honesto lo da
-- v_dashboard_data_quality_web (con_payload / sin_payload) y la UI TIENE que
-- rotular la grafica con el.
--
-- El JOIN es INNER a proposito: un embarque sin payload no tiene corredor
-- conocido, y meterlo como '(sin ruta)' inventaria una categoria que compite en
-- el ranking con corredores reales.

CREATE OR REPLACE VIEW international_purchases.v_dashboard_routes_web AS
SELECT
    p.pol_locode,
    p.pol_name,
    p.pod_locode,
    p.pod_name,
    COALESCE(p.pol_locode, '?') || ' → ' || COALESCE(p.pod_locode, '?') AS corredor,

    (count(*))::integer                                       AS total,
    (COALESCE(sum(s.container_count), (0)::bigint))::integer  AS contenedores,

    round(
        avg(s.ata - s.atd) FILTER (WHERE s.ata IS NOT NULL AND s.atd IS NOT NULL AND s.ata >= s.atd)
    , 1) AS transito_dias,
    round(
        avg(s.ata - s.eta) FILTER (WHERE s.ata IS NOT NULL AND s.eta IS NOT NULL)
    , 1) AS desviacion_dias
FROM audit_portal.v_international_purchases_shipments_web s
JOIN international_purchases.v_shipment_latest_payload p
     ON p.shipment_id = s.shipment_id
WHERE s.review_status <> 'DISCARDED'
  AND (p.pol_locode IS NOT NULL OR p.pod_locode IS NOT NULL)
GROUP BY p.pol_locode, p.pol_name, p.pod_locode, p.pod_name;


-- ============================================================
-- NIVEL 1 — Volumen por puerto de descarga (COBERTURA PARCIAL)
-- ============================================================
--
-- Misma advertencia de cobertura que la vista de corredores. Responde por donde
-- entra la mercancia, que es lo que decide con que agente aduanal se trabaja.

CREATE OR REPLACE VIEW international_purchases.v_dashboard_by_port_web AS
SELECT
    p.pod_locode,
    COALESCE(NULLIF(btrim(p.pod_name), ''::text), p.pod_locode) AS pod_name,
    p.pod_country,
    p.pod_country_code,

    (count(*))::integer                                       AS total,
    (COALESCE(sum(s.container_count), (0)::bigint))::integer  AS contenedores,
    (count(*) FILTER (WHERE s.ata IS NOT NULL))::integer      AS arribados
FROM audit_portal.v_international_purchases_shipments_web s
JOIN international_purchases.v_shipment_latest_payload p
     ON p.shipment_id = s.shipment_id
WHERE s.review_status <> 'DISCARDED'
  AND p.pod_locode IS NOT NULL
GROUP BY p.pod_locode, COALESCE(NULLIF(btrim(p.pod_name), ''::text), p.pod_locode),
         p.pod_country, p.pod_country_code;


-- ============================================================
-- NIVEL 1 — Calidad del dato y cobertura (cobertura total)
-- ============================================================
--
-- Una sola fila. Mide si el proceso se puede creer, no como va la mercancia.
-- Aqui vive el denominador (con_payload / sin_payload) que rotula las dos
-- vistas parciales de arriba.
--
-- Las 24 horas de obsolescencia son el mismo umbral que el warning
-- OBSOLETE_DATA del warning_catalog. Estan escritas dos veces -- aqui y en el
-- workflow de n8n que emite ese codigo -- y esa duplicidad es real: si cambia
-- el criterio, hay que tocar los dos sitios.

CREATE OR REPLACE VIEW international_purchases.v_dashboard_data_quality_web AS
SELECT
    (count(*))::integer                                          AS total,
    (count(*) FILTER (WHERE s.tracking_enabled))::integer        AS con_tracking,
    (count(*) FILTER (WHERE NOT s.tracking_enabled))::integer    AS sin_tracking,

    (count(*) FILTER (
        WHERE s.updated_at < now() - '24 hours'::interval
    ))::integer                                                  AS obsoletos,

    (count(*) FILTER (
        WHERE s.review_status = 'PENDING_REVIEW'
    ))::integer                                                  AS pendientes_revision,

    (count(*) FILTER (
        WHERE s.last_tracking_error IS NOT NULL
    ))::integer                                                  AS con_error_tracking,

    -- El denominador de las vistas de ruta. `total` menos `con_payload` no
    -- siempre da `sin_payload` si algun embarque descartado tuviera payload,
    -- por eso se cuentan los dos por separado sobre el mismo universo filtrado.
    (count(*) FILTER (WHERE p.shipment_id IS NOT NULL))::integer AS con_payload,
    (count(*) FILTER (WHERE p.shipment_id IS NULL))::integer     AS sin_payload
FROM audit_portal.v_international_purchases_shipments_web s
LEFT JOIN international_purchases.v_shipment_latest_payload p
     ON p.shipment_id = s.shipment_id
WHERE s.review_status <> 'DISCARDED';


-- ============================================================
-- GRANT — cinturon, no mecanismo
-- ============================================================
--
-- CREATE OR REPLACE conserva los privilegios existentes, asi que en una vista
-- que ya existia estos GRANT no hacen falta. Se dejan porque en la PRIMERA
-- ejecucion la vista nace sin ellos y audit_web_reader -- que es quien la
-- consulta de verdad desde el backend -- recibiria un 42501.

GRANT SELECT ON international_purchases.v_shipment_latest_payload            TO audit_web_reader;
GRANT SELECT ON international_purchases.v_dashboard_punctuality_web          TO audit_web_reader;
GRANT SELECT ON international_purchases.v_dashboard_punctuality_by_supplier_web TO audit_web_reader;
GRANT SELECT ON international_purchases.v_dashboard_transit_web              TO audit_web_reader;
GRANT SELECT ON international_purchases.v_dashboard_routes_web              TO audit_web_reader;
GRANT SELECT ON international_purchases.v_dashboard_by_port_web             TO audit_web_reader;
GRANT SELECT ON international_purchases.v_dashboard_data_quality_web        TO audit_web_reader;


COMMIT;


-- ============================================================
-- VERIFICACION — correr despues, y COMO audit_web_reader
-- ============================================================
--
-- Van comentadas a proposito: este archivo se aplica con `psql -f` y un SET ROLE
-- suelto dejaria la sesion cambiada. Copiar y pegar lo que haga falta.
--
-- 1) Las siete vistas existen:
--
--   SELECT viewname FROM pg_views
--    WHERE schemaname = 'international_purchases'
--      AND (viewname LIKE 'v_dashboard%' OR viewname = 'v_shipment_latest_payload')
--    ORDER BY viewname;
--
-- 2) Ninguna revienta y las de una fila devuelven exactamente una:
--
--   SELECT * FROM international_purchases.v_dashboard_punctuality_web;
--   SELECT * FROM international_purchases.v_dashboard_transit_web;
--   SELECT * FROM international_purchases.v_dashboard_data_quality_web;
--   SELECT * FROM international_purchases.v_dashboard_punctuality_by_supplier_web;
--   SELECT * FROM international_purchases.v_dashboard_routes_web;
--   SELECT * FROM international_purchases.v_dashboard_by_port_web;
--
-- 3) COMO EL ROL REAL. El paso 2 pasa siendo owner aunque falte el GRANT, y es
--    justo el paso que se salto la caida de agosto:
--
--   SET ROLE audit_web_reader;
--   SELECT * FROM international_purchases.v_dashboard_routes_web;
--   RESET ROLE;
--
-- 4) Cuadre de cobertura. con_payload + sin_payload tiene que dar `total`:
--
--   SELECT total, con_payload, sin_payload, con_payload + sin_payload AS suma
--     FROM international_purchases.v_dashboard_data_quality_web;
--
-- 5) Las seis vistas viejas siguen intactas (este script no las toca):
--
--   SELECT count(*) FROM international_purchases.v_dashboard_totals_web;
