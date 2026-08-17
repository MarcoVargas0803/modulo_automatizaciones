-- ============================================================================
-- schema-international-purchases-tracking-snapshot.sql
--
-- FASE 2 del tracking: guardar el ULTIMO payload de SafeCube por embarque, y la
-- vista de puntos que alimenta el mapa del Dashboard General.
--
-- POR QUE EXISTE
-- --------------
-- shipment_tracking_history solo recibe una fila cuando una FECHA CAMBIA: lo
-- impone tracking_history_date_changed_check. El tracking corre, SafeCube
-- devuelve una posicion nueva cada vez, y se TIRA si ninguna de las cuatro
-- fechas (etd/eta/atd/ata) se movio.
--
-- Medido en dev el 08/08/2026, antes de este script:
--
--     payload mas reciente de TODA la base ... 17 dias
--     payload mas viejo ...................... 26 dias
--     embarques con payload recuperable ...... 10 de 17
--
-- Un mapa "en vivo" sobre ese dato pintaria barcos donde estaban hace dos
-- semanas y media. Esta columna corrige la causa: se escribe en CADA corrida,
-- cambien o no las fechas.
--
-- OJO: ESTA COLUMNA NO LA ESCRIBE EL BACKEND
-- ------------------------------------------
-- n8n lee international_purchases.v_active_shipments_for_tracking, llama a
-- SafeCube y escribe DIRECTO a la base; el backend solo dispara el webhook. El
-- ALTER TABLE de aqui crea la columna, pero quien tiene que rellenarla es el
-- workflow de n8n, que NO esta en Git.
--
-- WORKFLOW ..... "Flujo_principal_tracking" (activo)
-- NODO ......... "UPDATE ETA And Dates"      (postgres, executeQuery)
--
-- Ese nodo ya hace dos cosas en la misma consulta, y la diferencia entre ellas
-- es justo el problema que esta columna viene a resolver:
--
--   UPDATE shipments ... WHERE shipment_id = $9      <- INCONDICIONAL, cada pasada
--   INSERT INTO shipment_tracking_history ...
--     WHERE NULLIF($10,'null') IS NOT NULL           <- SOLO si cambio una fecha
--
-- El payload completo YA viaja como $17 en queryReplacement
-- ({{ JSON.stringify($json.raw_tracking_payload) }}) y hoy solo lo consume el
-- INSERT. Por eso NO hace falta un nodo nuevo ni un parametro nuevo: bastan dos
-- lineas mas en el SET del UPDATE que ya existe, justo antes de
-- `last_tracking_error = NULL`:
--
--     last_tracking_payload = COALESCE(NULLIF($17,'null')::jsonb, last_tracking_payload),
--     last_tracking_payload_at = CASE
--         WHEN NULLIF($17,'null') IS NOT NULL THEN now()
--         ELSE last_tracking_payload_at
--       END,
--
-- El COALESCE y el CASE son deliberados: si una corrida falla y no trae payload,
-- se conserva el anterior en vez de borrarlo y dejar el embarque sin posicion.
--
-- CUAN "EN VIVO" QUEDA: el Schedule Trigger del workflow corre UNA VEZ AL DIA
-- (triggerAtHour: 9). Con este cambio la posicion pasa de 17-26 dias a <= 24 h.
-- Es una mejora enorme, pero no es tiempo real: subir la frecuencia consume
-- cuota de la API de SafeCube y es una decision de coste, no tecnica.
--
-- MIENTRAS ESO NO SE HAGA, EL MAPA SIGUE FUNCIONANDO: v_shipment_map_points_web
-- cae al historial con un COALESCE. Se vera con posiciones viejas, y cada punto
-- lleva su antiguedad para que se note. Es degradacion honesta, no un fallo
-- silencioso.
--
-- DEPENDE DE schema-international-purchases-indicators.sql
-- -------------------------------------------------------
-- Reutiliza su vista v_shipment_latest_payload en vez de repetir la extraccion
-- del JSON. Esa vista sigue siendo la unica que conoce la forma del payload.
--
-- CONTRATO DE SAFECUBE (verificado contra el OpenAPI de Container Tracking v2)
-- ---------------------------------------------------------------------------
-- routeData.coordinates: "AIS coordinates of the vessel if your shipment is
-- onboard a vessel, else last location coordinates." Por eso es la fuente del
-- pin y no lastVesselPosition: cubre 9 de 10 payloads en vez de 4 de 10, y
-- cuando ambas existen coinciden.
--
-- routeData.ais.status es un enum de TRES valores: OK | NOT_ON_BOARD |
-- NO_AIS_DATA. En dev solo aparecen los dos primeros; el tercero se contempla
-- igual (todo lo que no sea OK cuenta como posicion estimada).
--
-- IDEMPOTENTE: se puede correr N veces.
--
--   psql -h <host> -U <owner> -d <base> -f schema-international-purchases-tracking-snapshot.sql
--
-- Correr como el OWNER (n8n), no como audit_web_reader.
-- ============================================================================

BEGIN;


-- ============================================================
-- PREFLIGHT — la vista base del PR de indicadores tiene que existir
-- ============================================================

DO $preflight$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_views
         WHERE schemaname = 'international_purchases'
           AND viewname   = 'v_shipment_latest_payload'
    ) THEN
        RAISE EXCEPTION
            'ABORTADO: falta international_purchases.v_shipment_latest_payload. '
            'Aplicar antes schema-international-purchases-indicators.sql.';
    END IF;

    RAISE NOTICE 'Preflight OK: v_shipment_latest_payload existe.';
END $preflight$;


-- ============================================================
-- BLOQUE 1 — La columna instantanea
-- ============================================================
--
-- Sin NOT NULL ni default: un embarque que todavia no ha pasado por el tracking
-- no tiene payload, y '{}' seria mentir con un objeto vacio que la vista tendria
-- que distinguir de uno real.

ALTER TABLE international_purchases.shipments
    ADD COLUMN IF NOT EXISTS last_tracking_payload    jsonb,
    ADD COLUMN IF NOT EXISTS last_tracking_payload_at timestamptz;

COMMENT ON COLUMN international_purchases.shipments.last_tracking_payload IS
    'Ultimo payload completo de SafeCube. Lo escribe el workflow de n8n en CADA '
    'corrida, cambien o no las fechas -- a diferencia de shipment_tracking_history, '
    'que solo registra cambios de fecha. Fuente de posicion del mapa del Dashboard.';

COMMENT ON COLUMN international_purchases.shipments.last_tracking_payload_at IS
    'Momento en que se guardo last_tracking_payload. Es la antiguedad real que se '
    'muestra en cada punto del mapa.';


-- ============================================================
-- BLOQUE 2 — international_purchases.v_shipment_map_points_web
-- ============================================================
--
-- Una fila por embarque PINTABLE. Tres decisiones que no son obvias:
--
--   1. El COALESCE prefiere la columna nueva y cae al historial. Es lo que hace
--      este script desplegable ANTES de tocar n8n.
--   2. Se filtran los que no tienen coordenada. Un embarque sin lat/lng no es un
--      pin en (0, 0) -- que cae en el Golfo de Guinea y parece un dato real--,
--      es un embarque que no sale en el mapa.
--   3. Solo IN_TRANSIT y PLANNED. Es lo accionable, y coincide con el universo
--      que n8n refresca: v_active_shipments_for_tracking excluye DELIVERED, asi
--      que un pin de entregado quedaria congelado para siempre sin explicacion.
--
-- lat/lng salen como double precision y no como numeric a proposito: `pg`
-- devuelve numeric como CADENA, y position={["36.44", "-155.9"]} hace que
-- Leaflet coloque mal el pin o lance. Es la misma trampa que documenta
-- chartTheme.js para los COUNT/SUM.

CREATE OR REPLACE VIEW international_purchases.v_shipment_map_points_web AS
WITH snapshot AS (
    SELECT
        s.shipment_id,
        s.tracking_key,
        s.shipment_status,
        s.carrier,
        s.supplier_name,
        s.container_count,
        s.eta,

        -- La columna nueva manda; el historial es el plan B.
        COALESCE(base.last_tracking_payload, h.raw_payload)   AS payload,
        COALESCE(base.last_tracking_payload_at, h.payload_at) AS posicion_de
    FROM audit_portal.v_international_purchases_shipments_web s

    -- Las dos columnas del snapshot se leen de la TABLA, no de la fachada, y es
    -- deliberado. La fachada repite la lista entera de columnas de la vista
    -- interna (la deuda "la fachada de embarques copia 36 columnas"), asi que
    -- exponerlas ahi obligaria a un CREATE OR REPLACE ordenado de dos vistas...
    -- para meter un jsonb de ~5 kB por fila en la vista que alimenta el LISTADO
    -- de embarques, que no lo necesita. El resto de columnas si sale de la
    -- fachada, que sigue siendo la fuente del negocio.
    JOIN international_purchases.shipments base
         ON base.shipment_id = s.shipment_id

    LEFT JOIN (
        SELECT
            p.shipment_id,
            p.payload_detected_at AS payload_at,
            th.raw_tracking_payload AS raw_payload
        FROM international_purchases.v_shipment_latest_payload p
        JOIN international_purchases.shipment_tracking_history th
             ON th.shipment_id = p.shipment_id
            AND th.detected_at = p.payload_detected_at
    ) h ON h.shipment_id = s.shipment_id
    WHERE s.review_status <> 'DISCARDED'
      AND s.shipment_status IN ('IN_TRANSIT', 'PLANNED')
)
SELECT
    shipment_id,
    tracking_key,
    shipment_status,
    carrier,
    supplier_name,
    container_count,
    eta,

    (payload -> 'routeData' -> 'coordinates' ->> 'lat')::double precision AS lat,
    (payload -> 'routeData' -> 'coordinates' ->> 'lng')::double precision AS lng,

    -- Distingue una posicion AIS medida de una inferida. Pintarlas iguales seria
    -- vender como medido algo que es una estimacion.
    CASE
        WHEN payload -> 'routeData' -> 'ais' ->> 'status' = 'OK' THEN 'AIS'
        ELSE 'ESTIMADA'
    END AS posicion_origen,

    payload -> 'routeData' -> 'ais' -> 'data' -> 'vessel' ->> 'name' AS vessel_name,

    payload -> 'route' -> 'pol' -> 'location' ->> 'locode' AS pol_locode,
    payload -> 'route' -> 'pol' -> 'location' ->> 'name'   AS pol_name,
    payload -> 'route' -> 'pod' -> 'location' ->> 'locode' AS pod_locode,
    payload -> 'route' -> 'pod' -> 'location' ->> 'name'   AS pod_name,

    posicion_de,
    -- Antiguedad en dias enteros. Se calcula aqui para que el mapa, el popup y
    -- cualquier export digan lo mismo.
    (now()::date - posicion_de::date) AS posicion_dias,

    -- Mismo semaforo que v_shipments_portal, replicado sobre la ETA de esta
    -- vista para que el Badge del popup use el vocabulario del listado.
    CASE
        WHEN eta IS NULL              THEN 'SIN_ETA'
        WHEN eta < CURRENT_DATE       THEN 'ETA_VENCIDA'
        WHEN eta = CURRENT_DATE       THEN 'ETA_HOY'
        WHEN eta <= (CURRENT_DATE + 7) THEN 'ETA_PROXIMA'
        ELSE 'ETA_FUTURA'
    END AS eta_status
FROM snapshot
WHERE payload -> 'routeData' -> 'coordinates' ->> 'lat' IS NOT NULL
  AND payload -> 'routeData' -> 'coordinates' ->> 'lng' IS NOT NULL;


-- ============================================================
-- GRANT — cinturon, no mecanismo
-- ============================================================
--
-- En la PRIMERA ejecucion la vista nace sin privilegios y audit_web_reader
-- --que es quien la consulta desde el backend-- recibiria un 42501.

GRANT SELECT ON international_purchases.v_shipment_map_points_web TO audit_web_reader;


COMMIT;


-- ============================================================
-- VERIFICACION — correr despues, y COMO audit_web_reader
-- ============================================================
--
-- Van comentadas: este archivo se aplica con `psql -f` y un SET ROLE suelto
-- dejaria la sesion cambiada.
--
-- 1) Las columnas existen:
--
--   SELECT column_name FROM information_schema.columns
--    WHERE table_schema='international_purchases' AND table_name='shipments'
--      AND column_name LIKE 'last_tracking_payload%';
--
-- 2) Los puntos salen, ninguno con lat/lng nulos y ninguno DELIVERED:
--
--   SELECT tracking_key, shipment_status, lat, lng, posicion_origen, posicion_dias
--     FROM international_purchases.v_shipment_map_points_web
--    ORDER BY posicion_dias;
--
-- 3) COMO EL ROL REAL. El paso 2 pasa siendo owner aunque falte el GRANT:
--
--   SET ROLE audit_web_reader;
--   SELECT count(*) FROM international_purchases.v_shipment_map_points_web;
--   RESET ROLE;
--
-- 4) LA PRUEBA DE LA FASE 2. Antes del cambio en n8n, posicion_dias ronda 17-26
--    (viene del historial). Despues, tiene que caer a horas:
--
--   SELECT min(posicion_dias), max(posicion_dias),
--          count(*) FILTER (WHERE posicion_origen = 'AIS') AS con_ais
--     FROM international_purchases.v_shipment_map_points_web;
--
-- 5) Y cuantos embarques activos se quedan FUERA del mapa por no tener
--    coordenada -- el numero que el subtitulo del mapa tiene que confesar:
--
--   SELECT count(*) FILTER (WHERE shipment_status IN ('IN_TRANSIT','PLANNED')) AS activos
--     FROM audit_portal.v_international_purchases_shipments_web
--    WHERE review_status <> 'DISCARDED';
