
-- Espejo local del catálogo de navieras de Sinay. Una fila por código SCAC
-- (260), no por naviera (242): Sinay entrega scacCodes como arreglo.
CREATE TABLE IF NOT EXISTS international_purchases.scac_catalog (
  scac        TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  supports_bl BOOLEAN NOT NULL DEFAULT TRUE,
  maintenance BOOLEAN NOT NULL DEFAULT FALSE,
  synced_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- Por si la tabla ya existía sin las banderas. Sin ellas el UPSERT falla con 42703.
ALTER TABLE international_purchases.scac_catalog
  ADD COLUMN IF NOT EXISTS supports_bl BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE international_purchases.scac_catalog
  ADD COLUMN IF NOT EXISTS maintenance BOOLEAN NOT NULL DEFAULT FALSE;


-- El backend escribe en esta tabla al refrescar el catálogo.
GRANT SELECT, INSERT, UPDATE, DELETE ON international_purchases.scac_catalog TO audit_web_reader;


-- Verificación: debe devolver las 5 columnas.
SELECT column_name, data_type
  FROM information_schema.columns
 WHERE table_schema = 'international_purchases'
   AND table_name = 'scac_catalog'
 ORDER BY ordinal_position;


-- La tabla nace vacía. La puebla el backend en la primera petición del catálogo,
-- y requiere SINAY_API_KEY en el .env de producción. Mientras esté vacía la
-- validación de SCAC no aplica: acepta cualquier código sin avisar al usuario.
SELECT COUNT(*) AS total,
       COUNT(*) FILTER (WHERE NOT supports_bl) AS sin_rastreo_bl,
       MAX(synced_at) AS ultimo_refresco
  FROM international_purchases.scac_catalog;


-- Los SCAC ya usados en embarques deben aparecer en el catálogo. Si alguno sale
-- en_catalogo = false, editar ese embarque quedaría bloqueado por la validación.
SELECT DISTINCT s.scac,
       (c.scac IS NOT NULL) AS en_catalogo,
       c.name
  FROM international_purchases.shipments s
  LEFT JOIN international_purchases.scac_catalog c ON c.scac = s.scac
 WHERE s.scac IS NOT NULL
 ORDER BY s.scac;
