const env = require("../../../shared/config/env");
const pool = require("../../../shared/db/pool");
const { buildErrorResponse } = require("../../../shared/utils/errorResponse");
const { normalizeScac } = require("../utils/shipmentFields");

const SINAY_SEALINES_URL =
  "https://api.sinay.ai/container-tracking/api/v2/sealines";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

let cache = null;
let cacheTime = 0;

class ScacCatalogError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ScacCatalogError";
    this.status = status;
  }
}

function unwrapSinayPayload(json) {
  if (Array.isArray(json)) return json;
  if (Array.isArray(json?.sealines)) return json.sealines;
  if (Array.isArray(json?.data)) return json.data;

  return [];
}

/**
 * Convierte UNA naviera de Sinay en las filas de catalogo que le corresponden.
 *
 * Devuelve un arreglo, no un objeto: `scacCodes` es un ARREGLO y 13 de las 242
 * navieras tienen mas de un codigo —Crowley Maritime son CMCU y CAMN—, asi que
 * el catalogo real son 260 filas. Tratarlo como un solo codigo por naviera
 * perderia 18 codigos, y la validacion rechazaria embarques legitimos.
 *
 * Cada codigo pasa por `normalizeScac`, el MISMO normalizador que usa la
 * escritura de embarques: si el catalogo y `shipments.scac` normalizaran
 * distinto, la validacion rechazaria codigos correctos.
 *
 * @param {object} raw Entrada de `sealines` tal cual la entrega Sinay.
 * @returns {Array<{scac: string, name: string, supportsBl: boolean, maintenance: boolean}>}
 */
function expandSealine(raw) {
  if (!raw || typeof raw !== "object") return [];

  const codes = Array.isArray(raw.scacCodes) ? raw.scacCodes : [];
  const name = String(raw.name || "").trim();

  if (!name) return [];

  return codes
    .map((code) => normalizeScac(code))
    .filter(Boolean)
    .map((scac) => ({
      scac,
      name,
      // `activeTypes.bl` es lo unico que importa de activeTypes: el portal solo
      // rastrea por MBL. `ct` (contenedor) y `bk` (booking) no los usa.
      supportsBl: raw.activeTypes?.bl === true,
      maintenance: raw.maintenance === true,
    }));
}

async function persistCatalog(entries) {
  if (entries.length === 0) return;

  await pool.query(
    `
      INSERT INTO international_purchases.scac_catalog
             (scac, name, supports_bl, maintenance, synced_at)
      SELECT scac, name, supports_bl, maintenance, NOW()
        FROM UNNEST($1::text[], $2::text[], $3::boolean[], $4::boolean[])
             AS t(scac, name, supports_bl, maintenance)
      ON CONFLICT (scac) DO UPDATE
        SET name        = EXCLUDED.name,
            supports_bl = EXCLUDED.supports_bl,
            maintenance = EXCLUDED.maintenance,
            synced_at   = EXCLUDED.synced_at;
    `,
    [
      entries.map((e) => e.scac),
      entries.map((e) => e.name),
      entries.map((e) => e.supportsBl),
      entries.map((e) => e.maintenance),
    ],
  );
}

// Se ordena por nombre y luego por codigo: las 13 navieras con varios SCAC
// comparten nombre, y sin el segundo criterio su orden relativo seria arbitrario
// entre consultas.
async function readCatalogFromDb() {
  const result = await pool.query(
    `SELECT scac,
            name,
            supports_bl AS "supportsBl",
            maintenance
       FROM international_purchases.scac_catalog
      ORDER BY name ASC, scac ASC;`,
  );

  return result.rows;
}

/**
 * Devuelve el catalogo, una fila por codigo SCAC (260 el 09/08/2026, no 242:
 * hay navieras con varios codigos).
 *
 * Recorre la cadena de respaldo en orden. Solo lanza cuando NINGUN eslabon
 * responde: sin API key y sin espejo en base no hay catalogo que devolver.
 *
 * `supportsBl` en false significa que la naviera no admite rastreo por Bill of
 * Lading y, como el portal solo rastrea por MBL, ese embarque no avanzara solo.
 * No se filtra: el consumidor avisa, no bloquea.
 *
 * @returns {Promise<Array<{scac: string, name: string, supportsBl: boolean, maintenance: boolean}>>}
 * @throws {ScacCatalogError} 500 si no hay API key ni espejo; 502 si Sinay
 *   contesta mal y el espejo esta vacio.
 */
async function getScacCatalog() {
  const now = Date.now();

  if (cache && now - cacheTime < CACHE_TTL_MS) {
    return cache;
  }

  if (!env.sinay.apiKey) {
    // Sin key no se puede refrescar, pero el espejo puede seguir sirviendo. Es
    // el caso de un entorno donde la key no se configuro pero la base viene de
    // un respaldo con datos.
    const stored = await readCatalogFromDb();

    if (stored.length > 0) return stored;

    throw new ScacCatalogError(
      "La API Key de Sinay no está configurada en el servidor.",
      500,
    );
  }

  try {
    const response = await fetch(SINAY_SEALINES_URL, {
      headers: {
        API_KEY: env.sinay.apiKey,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Sinay respondio ${response.status}: ${errorText.slice(0, 300)}`);
    }

    const entries = unwrapSinayPayload(await response.json()).flatMap(expandSealine);

    if (entries.length === 0) {
      throw new Error("Sinay devolvio un catalogo vacio o con una forma inesperada");
    }

    await persistCatalog(entries);

    cache = entries;
    cacheTime = now;

    return cache;
  } catch (error) {
    // Sinay caido no debe dejar sin catalogo: se cae al espejo. El error se
    // registra porque si no, una API rota pasaria inadvertida durante dias
    // mientras el espejo la tapa.
    console.error("Sinay no respondio, se usa el espejo local:", error.message);

    const stored = await readCatalogFromDb();

    if (stored.length > 0) return stored;

    throw new ScacCatalogError(
      "Error al consultar el catálogo de navieras en Sinay.",
      502,
    );
  }
}

/**
 * Comprueba un SCAC contra el espejo en base.
 *
 * Consulta la tabla y no `getScacCatalog()` a proposito: validar una escritura
 * no debe poder disparar una llamada a una API externa de pago, ni quedarse
 * esperando su timeout mientras el usuario tiene el formulario abierto.
 *
 * `catalogAvailable: false` significa "todavia no hay contra que validar" —tabla
 * vacia, tipicamente un despliegue nuevo antes del primer refresco—. El llamador
 * debe DEJAR PASAR en ese caso: rechazar altas por no tener catalogo seria peor
 * que aceptar un codigo sin comprobar.
 *
 * @param {string} scac Codigo ya normalizado con normalizeScac.
 * @returns {Promise<{known: boolean, catalogAvailable: boolean}>}
 *
 * @example
 * const { known, catalogAvailable } = await isKnownScac(scac);
 * if (catalogAvailable && !known) {
 *   errors.push("El SCAC no corresponde a ninguna naviera del catálogo.");
 * }
 */
async function isKnownScac(scac) {
  const result = await pool.query(
    `
      SELECT
        EXISTS (SELECT 1 FROM international_purchases.scac_catalog WHERE scac = $1) AS known,
        EXISTS (SELECT 1 FROM international_purchases.scac_catalog)                 AS available;
    `,
    [scac],
  );

  const row = result.rows[0];

  return {
    known: row?.known === true,
    catalogAvailable: row?.available === true,
  };
}

// Mensaje unico. Lo usan las tres escrituras y el frontend lo muestra tal cual
// dentro de su lista de errores de validacion.
const SCAC_UNKNOWN_MESSAGE =
  "El SCAC no corresponde a ninguna naviera del catálogo.";

/**
 * Valida un SCAC para una escritura. Devuelve el mensaje de error, o `null` si
 * se acepta.
 *
 * Existe para que la regla de arranque en frio se escriba UNA vez: las tres
 * escrituras que validan SCAC (alta interna, edicion interna y alta publica)
 * tendrian que acordarse cada una de dejar pasar cuando el catalogo esta vacio,
 * y basta que una lo olvide para que un despliegue nuevo rechace altas validas.
 *
 * @param {string} scac Codigo ya normalizado con normalizeScac.
 * @returns {Promise<string|null>}
 *
 * @example
 * const scacError = await scacValidationError(scac);
 * if (scacError) {
 *   return res.status(400).json({ success: false, message: "...", errors: [scacError] });
 * }
 */
async function scacValidationError(scac) {
  const { known, catalogAvailable } = await isKnownScac(scac);

  if (!catalogAvailable) {
    console.warn(
      `Catalogo SCAC vacio: se acepta "${scac}" sin validar. Refresque el catalogo para que la validacion vuelva a aplicar.`,
    );

    return null;
  }

  return known ? null : SCAC_UNKNOWN_MESSAGE;
}

/**
 * Handler HTTP del catalogo, compartido por el router interno y el publico.
 *
 * Los dos endpoints —`/scac-catalog` y `/public/scac-catalog`— tenian el mismo
 * cuerpo escrito dos veces; lo unico que los diferencia es el guard con el que
 * se montan, y eso sigue decidiendolo cada router.
 *
 * NOTA DE CONVENCION: `backend-design.md` (regla 6) dice que la logica va en el
 * router y que `services/` solo aloja lo puro, que no toca Express. Esta funcion
 * es la excepcion consciente: la alternativa era duplicar el handler, que es
 * justo el problema que este archivo existe para evitar. No es un precedente
 * para mover logica de rutas a servicios.
 *
 * @example
 * router.get("/international-purchases/scac-catalog", ...guard, scacCatalogHandler);
 */
async function scacCatalogHandler(req, res) {
  try {
    const data = await getScacCatalog();

    return res.json({ success: true, data });
  } catch (error) {
    if (error instanceof ScacCatalogError) {
      return res.status(error.status).json({
        success: false,
        message: error.message,
      });
    }

    return res
      .status(500)
      .json(buildErrorResponse("Error al consultar el catálogo de SCAC", error));
  }
}

module.exports = {
  ScacCatalogError,
  SCAC_UNKNOWN_MESSAGE,
  getScacCatalog,
  isKnownScac,
  scacValidationError,
  scacCatalogHandler,
};
