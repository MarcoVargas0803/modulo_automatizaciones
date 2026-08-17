-- ============================================================
-- DDL: Registro de embarques por forwarder (Compras Internacionales)
-- Ejecutar contra la base de datos n8n (PostgreSQL 16)
--
-- Es idempotente a proposito: se puede correr varias veces sin romper nada.
-- El esquema international_purchases NO tenia DDL versionado; este archivo
-- cubre unicamente lo que agrega este proyecto, no reconstruye shipments.
--
-- ORDEN DE EJECUCION
--   Bloque 1 y 2  -> Fase 2 (enlace de registro externo)
--   Bloque 3      -> Fase 2, requiere confirmar antes el punto 4 de
--                    docs/pendientes-coordinacion-compras-internacionales.md
--   Bloque 4      -> Paso B de la retirada de `bl`. NO EJECUTAR hasta cerrar
--                    el punto 2 de ese mismo documento.
--   Bloque 5      -> reversion, solo si hay que deshacer
-- ============================================================

BEGIN;

CREATE SCHEMA IF NOT EXISTS international_purchases;

-- pgcrypto da gen_random_uuid(). En PostgreSQL 13+ ya viene en el core, pero
-- se declara por si la base es anterior o la extension no esta habilitada.
CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- ============================================================
-- BLOQUE 1 — Enlaces de registro entregados a los forwarders
-- ============================================================
--
-- Un enlace es permanente por diseno: se envia una sola vez y el forwarder
-- registra cuantos embarques quiera. Por eso `expires_at` es NULL en el caso
-- normal y el corte se hace por inactividad (`dormant_after_days`), evaluado
-- de forma perezosa al presentar el token -- el backend no tiene planificador
-- de tareas y no se va a introducir uno para esto.
--
-- IMPORTANTE: `token_hash` guarda el SHA-256 del token, nunca el token. Si se
-- filtra un respaldo de la base, nadie obtiene acceso de escritura. El token en
-- claro solo existe una vez, en la respuesta que ve el operador al emitirlo.

CREATE TABLE IF NOT EXISTS international_purchases.registration_invites (
    invite_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    token_hash            TEXT NOT NULL UNIQUE,

    forwarder_name        TEXT NOT NULL,
    recipient_email       TEXT NOT NULL,

    status                TEXT NOT NULL DEFAULT 'ACTIVE'
                          CHECK (status IN ('ACTIVE', 'DORMANT', 'REVOKED')),

    -- NULL = permanente. Es el caso normal; existe la columna para poder emitir
    -- un enlace acotado si alguna vez hace falta.
    expires_at            TIMESTAMP WITH TIME ZONE,

    -- Inactividad tolerada antes de pasar a DORMANT. 548 dias = 18 meses.
    -- NULL = nunca pasa a DORMANT.
    dormant_after_days    INT DEFAULT 548,

    submission_count      INT NOT NULL DEFAULT 0,
    last_used_at          TIMESTAMP WITH TIME ZONE,

    -- Traza de la regeneracion: al reemplazar un enlace (por ejemplo, cuando
    -- cambia la persona de contacto del forwarder) el viejo se revoca y apunta
    -- al nuevo, en vez de perderse el rastro.
    replaced_by_invite_id UUID REFERENCES international_purchases.registration_invites(invite_id),

    created_by            TEXT NOT NULL,
    created_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    revoked_by            TEXT,
    revoked_at            TIMESTAMP WITH TIME ZONE
);

-- La busqueda por token solo mira enlaces vivos: indice parcial en vez de uno
-- completo, porque los revocados se acumulan y nunca se consultan por hash.
CREATE INDEX IF NOT EXISTS idx_registration_invites_active
    ON international_purchases.registration_invites (token_hash)
    WHERE status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_registration_invites_status
    ON international_purchases.registration_invites (status, created_at DESC);

COMMENT ON TABLE international_purchases.registration_invites IS
    'Enlaces permanentes entregados a forwarders para que registren embarques sin cuenta en el sistema. token_hash es SHA-256; el token en claro nunca se almacena.';


-- ============================================================
-- BLOQUE 2 — Ciclo de revision sobre shipments
-- ============================================================
--
-- No hay tabla de borradores: el forwarder escribe directo en shipments para
-- que el tracking de n8n arranque de inmediato. Lo que sustituye a la
-- moderacion es este ciclo de revision POSTERIOR, que no bloquea nada.
--
--   PENDING_REVIEW  registrado por un forwarder, el operador aun no lo mira
--   REVIEWED        el operador lo valido (o lo creo el mismo)
--   DISCARDED       basura o duplicado; se oculta del listado sin borrar la
--                   fila, para conservar la traza. Sustituye al DELETE, que
--                   ademas purga shipment_tracking_history.

ALTER TABLE international_purchases.shipments
    ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'REVIEWED';

ALTER TABLE international_purchases.shipments
    ADD COLUMN IF NOT EXISTS reviewed_by TEXT;

ALTER TABLE international_purchases.shipments
    ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE international_purchases.shipments
    ADD COLUMN IF NOT EXISTS registered_by_invite_id UUID
        REFERENCES international_purchases.registration_invites(invite_id);

-- El DEFAULT 'REVIEWED' es deliberado: todo lo que ya existe y todo lo que
-- capture el operador nace revisado. Solo el alta externa escribe
-- 'PENDING_REVIEW' de forma explicita.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'international_purchases.shipments'::regclass
           AND conname  = 'shipments_review_status_check'
    ) THEN
        ALTER TABLE international_purchases.shipments
            ADD CONSTRAINT shipments_review_status_check
            CHECK (review_status IN ('PENDING_REVIEW', 'REVIEWED', 'DISCARDED'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_shipments_pending_review
    ON international_purchases.shipments (review_status)
    WHERE review_status = 'PENDING_REVIEW';

COMMENT ON COLUMN international_purchases.shipments.review_status IS
    'Ciclo de revision posterior al alta. Solo el registro externo nace PENDING_REVIEW; no bloquea el tracking.';


-- ============================================================
-- BLOQUE 3 — source_type admite 'FORWARDER'
-- ============================================================
--
-- VERIFICADO CONTRA LA BASE DE DESARROLLO (05/08/2026). El CHECK existe y es:
--
--   shipments_source_type_check
--     CHECK (source_type = ANY (ARRAY['EMAIL','PORTAL','N8N','MANUAL']))
--
-- OJO -- ese conjunto NO coincide con el que valida el backend:
--
--   ALLOWED_SOURCE_TYPES = ["PORTAL", "N8N", "IMPORT", "SYSTEM"]
--
-- Es decir: 'EMAIL' y 'MANUAL' son valores legales en la base (y 'EMAIL' es
-- ademas el DEFAULT de la columna) pero el filtro del listado los rechaza con
-- 400; y 'IMPORT'/'SYSTEM' pasan el filtro pero no pueden existir en la tabla.
-- Hoy no se nota porque las 13 filas son 'PORTAL'. Esa divergencia se corrige
-- en el codigo, no aqui.
--
-- Por eso el ALTER de abajo CONSERVA los cuatro valores existentes y solo suma
-- 'FORWARDER'. Sustituir el conjunto por el del backend romperia el DEFAULT.

ALTER TABLE international_purchases.shipments
    DROP CONSTRAINT IF EXISTS shipments_source_type_check;

ALTER TABLE international_purchases.shipments
    ADD CONSTRAINT shipments_source_type_check
    CHECK (source_type = ANY (ARRAY['EMAIL', 'PORTAL', 'N8N', 'MANUAL', 'FORWARDER']));

COMMIT;


-- ============================================================
-- NOTA — CADUCADA: las columnas del Bloque 2 SI exigen tocar las vistas
-- ============================================================
--
-- Esta nota decia que no habia que tocar ninguna vista, porque el listado hacia
--
--   FROM audit_portal.v_international_purchases_shipments_web v
--   JOIN international_purchases.shipments s ON s.shipment_id = v.shipment_id
--
-- y leia review_status, reviewed_by y reviewed_at como s.<columna>. Era cierto
-- cuando se escribio (05/08/2026) y dejo de serlo un dia despues: el commit
-- 9132f8c quito ese JOIN y paso las 11 columnas a `v.`. La nota sobrevivio al
-- cambio y es lo que hizo que nadie aplicara SQL en produccion al desplegar
-- -> 500 en todo el listado (42703, column v.review_status does not exist).
--
-- Ahora review_status, reviewed_by y reviewed_at tienen que estar en las DOS
-- vistas de la cadena. Su DDL vive en schema-international-purchases-views.sql,
-- que hay que aplicar en el mismo despliegue que este archivo.
--
-- (registered_by_invite_id sigue sin exponerse: el listado no lo lee.)


-- ============================================================
-- BLOQUE 4 — Paso B: retirar la columna espejo `bl`
-- ============================================================
--
-- NO EJECUTAR todavia. Requiere DOS condiciones, no una:
--
--   (A) Que este desplegado el Paso A -- el commit que quita `bl` del INSERT y
--       del UPDATE de international-purchases.routes.js. Se intento ejecutar
--       este bloque en produccion el 06/08/2026 con el codigo anterior aun
--       desplegado: ese codigo NOMBRA la columna al insertar y al editar, asi
--       que el DROP habria dejado el portal con lectura sana y escritura muerta
--       (42703 en cada alta y en cada edicion de MBL). La transaccion aborto
--       sola por el error de las vistas -- ver mas abajo -- antes de llegar al
--       DROP. No se debe confiar en esa casualidad.
--
--   (B) Cerrar el punto 2 de docs/pendientes-coordinacion-compras-internacionales.md:
--       confirmar que ningun consumidor EXTERNO al portal y al flujo de
--       tracking (reportes, Power BI, otro flujo de n8n) lee la columna. Que no
--       la usan el portal ni Flujo_principal_tracking.json ya esta verificado.
--
-- VERIFICADO CONTRA LA BASE DE DESARROLLO (05/08/2026):
--
--   * `bl` esta MUERTA en la practica. El INSERT del portal la deriva con
--     CASE WHEN tracking_reference_type = 'BL' THEN tracking_key ELSE NULL END,
--     pero el CHECK shipments_tracking_reference_type_check obliga a que
--     tracking_reference_type sea exactamente 'MBL', asi que esa rama NUNCA se
--     cumple: todo embarque nuevo nace con bl = NULL.
--     De 13 filas, solo 3 tienen bl, todas del 18-22/07/2026 (anteriores al
--     CHECK actual) y en las 3 bl = tracking_key exactamente.
--
--   * Son TRES las vistas que referencian la columna, no dos:
--       audit_portal.v_international_purchases_shipments_web
--         -> international_purchases.v_shipments_portal        (listado del portal)
--       international_purchases.v_active_shipments_for_tracking (la que lee n8n)
--     Las dos primeras encadenadas; la tercera es independiente y hace
--       COALESCE(bl, tracking_key) AS bl
--     Hay que recrear las tres ANTES del DROP COLUMN, de dentro hacia fuera.
--
--   * n8n NO usa la columna. Verificado sobre Flujo_principal_tracking.json: la trae
--     el SELECT * pero ningun nodo la lee (Calculate ETA and Dates solo consume
--     eta/etd/atd/ata/shipment_status/shipment_id, y la llamada a SafeCube usa
--     tracking_key + scac). Tampoco la escribe el UPDATE.
--
--   * La vista interna usa `bl` en dos columnas derivadas, y en ambas la rama
--     de bl es INALCANZABLE por el mismo motivo (tracking_reference_type nunca
--     es NULL, siempre gana la primera rama):
--       primary_reference_type  : CASE WHEN tracking_reference_type IS NOT NULL
--                                      THEN tracking_reference_type
--                                      WHEN btrim(bl) <> '' THEN 'BL' ... END
--       primary_reference_value : CASE WHEN btrim(tracking_key) <> ''
--                                      THEN tracking_key
--                                      WHEN btrim(bl) <> '' THEN bl ... END
--     Al quitar bl, la primera colapsa a tracking_reference_type y la segunda a
--     tracking_key (que ademas es NOT NULL). El frontend SI consume
--     primary_reference_type, asi que la columna debe seguir existiendo.
--
--   * Hay un indice sobre la columna: idx_shipments_bl. DROP COLUMN lo elimina
--     en cascada, pero conviene saberlo.
--
--   * CREATE OR REPLACE VIEW NO PUEDE QUITAR COLUMNAS. Comprobado en produccion
--     el 06/08/2026: devuelve "ERROR: cannot drop columns from view". Las dos
--     vistas encadenadas hay que DROP + CREATE, de fuera hacia dentro para
--     borrarlas y de dentro hacia fuera para crearlas.
--
--   * DROP VIEW SE LLEVA LOS PERMISOS. Las tres vistas son propiedad de `n8n` y
--     tienen GRANT SELECT a `audit_web_reader` ({n8n=arwdDxt/n8n,
--     audit_web_reader=r/n8n}). Si se recrean sin re-otorgar, el portal pierde
--     acceso al listado. Por eso el bloque de abajo termina con dos GRANT.
--
--   * DROP VIEW va SIN CASCADE a proposito. Se verifico por pg_depend que solo
--     existen esas tres vistas y que nada mas cuelga de ellas; si en produccion
--     el DROP falla por una dependencia, es justo el consumidor desconocido que
--     busca la condicion (B). Que falle es la senal, no el problema.
--
-- COMPROBACION PREVIA -- debe devolver 0. Si no, `bl` y `tracking_key` divergen
-- en alguna fila y el `tracking_key AS bl` del paso 3 NO seria equivalente:
--
--   SELECT count(*) FROM international_purchases.shipments
--    WHERE bl IS NOT NULL AND bl IS DISTINCT FROM tracking_key;
--
-- BEGIN;
--
--   -- 1) Fuera las dos encadenadas, de FUERA hacia dentro. Sin CASCADE.
--   DROP VIEW audit_portal.v_international_purchases_shipments_web;
--   DROP VIEW international_purchases.v_shipments_portal;
--
--   -- 2) Vista interna, sin bl. Las dos columnas derivadas colapsan a una sola
--   --    rama: tracking_reference_type es NOT NULL por CHECK y tracking_key
--   --    tiene CHECK de no-vacio, asi que la rama de bl era inalcanzable.
--   CREATE VIEW international_purchases.v_shipments_portal AS
--   SELECT shipment_id, tracking_key, tracking_reference_type,
--          tracking_provider_type, tracking_provider_name, scac, carrier,
--          agency, material_description, container_count, terminal,
--          etd, eta, atd, ata, shipment_status, source_type, tracking_enabled,
--          portal_created_by, portal_notes,
--          tracking_reference_type AS primary_reference_type,
--          tracking_key           AS primary_reference_value,
--          CASE
--            WHEN eta IS NULL THEN 'SIN_ETA'::text
--            WHEN eta < CURRENT_DATE THEN 'ETA_VENCIDA'::text
--            WHEN eta = CURRENT_DATE THEN 'ETA_HOY'::text
--            WHEN eta <= (CURRENT_DATE + '7 days'::interval) THEN 'ETA_PROXIMA'::text
--            ELSE 'ETA_FUTURA'::text
--          END AS eta_status,
--          CASE WHEN eta IS NULL THEN NULL::integer ELSE eta - CURRENT_DATE END AS days_to_eta,
--          updated_at
--     FROM international_purchases.shipments s;
--
--   -- 3) Vista externa, sin bl. Envoltorio que solo agrega process_code.
--   CREATE VIEW audit_portal.v_international_purchases_shipments_web AS
--   SELECT 'international_purchases'::text AS process_code,
--          shipment_id, tracking_key, tracking_reference_type,
--          tracking_provider_type, tracking_provider_name, scac, carrier,
--          agency, material_description, container_count, terminal,
--          etd, eta, atd, ata, shipment_status, source_type, tracking_enabled,
--          portal_created_by, portal_notes,
--          primary_reference_type, primary_reference_value,
--          eta_status, days_to_eta, updated_at
--     FROM international_purchases.v_shipments_portal;
--
--   -- 4) Vista que consume n8n. Hacia COALESCE(bl, tracking_key) AS bl y como bl
--   --    nunca difiere de tracking_key, `tracking_key AS bl` devuelve EXACTAMENTE
--   --    lo mismo. Se CONSERVA la columna a proposito: quitarla cambiaria la forma
--   --    del SELECT * de un flujo en produccion sin necesidad. Aqui si vale
--   --    CREATE OR REPLACE: no se elimina ninguna columna.
--   CREATE OR REPLACE VIEW international_purchases.v_active_shipments_for_tracking AS
--   SELECT shipment_id, tracking_key,
--          tracking_key AS bl,
--          scac, carrier, eta, etd, ata, atd, shipment_status, shipment_type
--     FROM international_purchases.shipments
--    WHERE shipment_status = ANY (ARRAY['PLANNED'::text, 'IN_TRANSIT'::text, 'UNKNOWN'::text])
--    ORDER BY updated_at;
--
--   -- 5) Restaurar los permisos que se llevo el DROP VIEW del paso 1.
--   GRANT SELECT ON international_purchases.v_shipments_portal TO audit_web_reader;
--   GRANT SELECT ON audit_portal.v_international_purchases_shipments_web TO audit_web_reader;
--
--   -- 6) Y ahora si, la columna. Se lleva por delante idx_shipments_bl en cascada.
--   ALTER TABLE international_purchases.shipments DROP COLUMN IF EXISTS bl;
--
-- COMMIT;


-- ============================================================
-- BLOQUE 5 — Reversion
-- ============================================================
--
-- Deshace los bloques 1 a 3. Destructivo: borra los enlaces emitidos y el
-- estado de revision de todos los embarques. Solo para revertir un despliegue
-- fallido en un entorno donde eso sea aceptable.
--
-- BEGIN;
--   ALTER TABLE international_purchases.shipments
--       DROP CONSTRAINT IF EXISTS shipments_review_status_check;
--   DROP INDEX IF EXISTS international_purchases.idx_shipments_pending_review;
--   ALTER TABLE international_purchases.shipments
--       DROP COLUMN IF EXISTS registered_by_invite_id,
--       DROP COLUMN IF EXISTS reviewed_at,
--       DROP COLUMN IF EXISTS reviewed_by,
--       DROP COLUMN IF EXISTS review_status;
--   DROP TABLE IF EXISTS international_purchases.registration_invites;
--   -- El CHECK de source_type queda admitiendo FORWARDER; devolverlo al
--   -- conjunto original solo si no quedan filas con ese valor.
-- COMMIT;
