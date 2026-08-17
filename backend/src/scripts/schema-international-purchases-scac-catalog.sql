-- ============================================================
-- ESQUEMA: international_purchases — catálogo SCAC
-- Fecha: 2026-08-09
--
-- Espejo local del catálogo de navieras de Sinay
-- (https://api.sinay.ai/container-tracking/api/v2/sealines).
--
-- POR QUÉ EXISTE. Hasta ahora el catálogo vivía SOLO en una caché en memoria de
-- 24 h dentro de services/scacCatalog.service.js. Eso bastaba mientras el SCAC
-- fuera una sugerencia, pero deja de bastar en cuanto se valida contra él:
--
--   * Sin respaldo, una caída de Sinay con la caché fría dejaría al servidor sin
--     catálogo contra el que validar, y bloquearía TODAS las altas de embarque
--     —incluidas las del forwarder externo, que no puede hacer nada al respecto—.
--   * La caché es de proceso. Si algún día se escala en horizontal, cada réplica
--     tendría la suya y validarían contra estados distintos.
--
-- Con esta tabla el orden es: caché → Sinay (y se persiste aquí) → esta tabla.
-- Sinay caído deja de ser un incidente que para el negocio.
--
-- CÓMO SE REFRESCA. No hay planificador en el proyecto y no se va a introducir
-- uno (mismo criterio que la latencia perezosa de los enlaces de forwarder, ver
-- utils/inviteToken.js). El refresco es perezoso: la primera petición del
-- catálogo tras expirar la caché de 24 h vuelve a pedirlo a Sinay y hace UPSERT
-- aquí. Una fila nunca se borra al desaparecer de Sinay: un SCAC retirado del
-- catálogo sigue siendo válido para los embarques históricos que ya lo usan.
--
-- ARRANQUE EN FRÍO. Mientras esta tabla esté vacía, la validación de SCAC se
-- omite a propósito (`catalogAvailable: false` en el servicio). No se puede
-- validar contra un catálogo que todavía no existe, y un despliegue nuevo no
-- debe rechazar altas legítimas por eso.
-- ============================================================

CREATE SCHEMA IF NOT EXISTS international_purchases;
GRANT USAGE ON SCHEMA international_purchases TO audit_web_reader;

-- ─── Tablas ──────────────────────────────────────────────────

-- Una fila por CÓDIGO, no por naviera. Sinay entrega `scacCodes` como arreglo y
-- 13 de sus 242 navieras tienen más de uno (Crowley Maritime = CMCU + CAMN), así
-- que el catálogo real son 260 códigos. Medido contra la API el 09/08/2026.
--
-- `scac` puede ser PRIMARY KEY porque ningún código se repite entre navieras;
-- también verificado sobre la respuesta real, no supuesto.
CREATE TABLE IF NOT EXISTS international_purchases.scac_catalog (
  scac        TEXT PRIMARY KEY,
  name        TEXT NOT NULL,

  -- `activeTypes.bl` de Sinay: si la naviera admite rastreo por Bill of Lading.
  -- Importa porque el portal SOLO rastrea por MBL —el CHECK
  -- shipments_tracking_reference_type_check obliga a que sea 'MBL'—, así que un
  -- embarque de una naviera con supports_bl = false no se va a rastrear solo.
  -- 25 de las 242 estaban así el 09/08/2026.
  --
  -- NO se usa para filtrar ni para rechazar: esas navieras existen y un forwarder
  -- puede traer un embarque legítimo de una de ellas. Sirve para AVISAR en el
  -- formulario, de modo que el operador sepa por qué ese embarque no avanza en
  -- vez de descubrirlo cuando el tracking nunca llega.
  supports_bl BOOLEAN NOT NULL DEFAULT TRUE,

  -- `maintenance` de Sinay: la naviera está temporalmente fuera de servicio en su
  -- API. Es transitorio y el espejo se refresca cada 24 h, así que este valor
  -- puede ir hasta un día por detrás de la realidad. Mismo uso: avisar, no
  -- bloquear.
  maintenance BOOLEAN NOT NULL DEFAULT FALSE,

  -- Cuándo se vio por última vez en la respuesta de Sinay. Sirve para saber si
  -- el espejo está fresco sin tener que llamar a la API.
  synced_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Las dos banderas se añadieron después de la primera versión de este script.
-- `CREATE TABLE IF NOT EXISTS` no toca una tabla que ya existe, así que un
-- entorno donde se aplicó la versión anterior se quedaría sin ellas y sin aviso
-- —el UPSERT del servicio fallaría con 42703—. Estos ALTER son idempotentes y
-- dejan el script seguro de reejecutar.
ALTER TABLE international_purchases.scac_catalog
  ADD COLUMN IF NOT EXISTS supports_bl BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE international_purchases.scac_catalog
  ADD COLUMN IF NOT EXISTS maintenance BOOLEAN NOT NULL DEFAULT FALSE;

GRANT SELECT, INSERT, UPDATE, DELETE ON international_purchases.scac_catalog TO audit_web_reader;
