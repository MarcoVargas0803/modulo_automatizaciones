const env = require("../config/env");

// Entornos en los que SI se adjunta error.message a la respuesta HTTP.
//
// Antes la condicion era `env.nodeEnv !== "production"`: una lista negra de un
// solo elemento, que trata como entorno de desarrollo TODO lo que no sea esa
// cadena exacta. Un NODE_ENV mal escrito -"Production", "prod", "produccion"-
// mandaba el detalle tecnico del error al navegador sin que nada avisara.
// La lista blanca invierte eso: lo que no reconoce, no lo expone.
//
// La lista blanca sola NO bastaba: `env.nodeEnv` cae a un default cuando la
// variable esta ausente, y ese default era "development" -- dentro de la lista, o
// sea, filtrando. Se cerro en el mismo cambio poniendo el default en "production"
// (config/env.js:25). Las dos piezas son necesarias y ninguna sustituye a la otra:
// esta cubre el valor MAL ESCRITO, el default cubre el valor AUSENTE.
//
// Un tercer frente esta en docker-compose.yml: `NODE_ENV: production` se fija en
// el bloque `environment`, que tiene precedencia sobre `env_file`, para que el modo
// de produccion no dependa de backend/.env -- gitignorado, y por tanto invisible
// en una revision de PR.
//
// No se lee `process.env.NODE_ENV` directamente a proposito: regla dura 2 de
// backend-design.md -- toda variable de entorno pasa por config/env.js.
const ENTORNOS_CON_DETALLE = ["development", "test"];

/**
 * Cuerpo uniforme de error. Registra el error en el servidor y decide, segun el
 * entorno, si el detalle tecnico puede acompanar a la respuesta.
 *
 * POR QUE REGISTRA AQUI (07/08/2026)
 * ---------------------------------
 * `GET /api/international-purchases/shipments` devolvio 500 en produccion
 * durante horas y el error real —un 42703 de Postgres, `column v.review_status
 * does not exist`— no aparecio en NINGUN sitio: esta funcion lo omite de la
 * respuesta en produccion (correcto) y el `catch` que la llamaba no registraba
 * nada. Un error perfectamente diagnosticable se investigo a ciegas.
 *
 * Registrar aqui cubre los ~87 endpoints de una vez, porque todos los `catch`
 * del proyecto pasan por esta funcion (regla dura 3 de backend-design.md).
 *
 * SE REGISTRA EL OBJETO COMPLETO, no `error.message`. Es la diferencia entre
 * leer "column v.review_status does not exist" y leer eso MAS `code: '42703'`,
 * `position`, `where` y la traza. El codigo de SQLSTATE es lo que se busca en
 * los logs; el mensaje es prosa.
 *
 * @param {string} message Mensaje para el cliente. Nunca incluir datos internos.
 * @param {Error} [error] Error capturado. Si se omite, no se registra nada.
 * @param {object} [options]
 * @param {boolean} [options.log=true] Poner en `false` solo si quien llama YA
 *   registro el error con mas contexto, para no duplicar la linea. Hoy el unico
 *   caso es `globalErrorHandler`, que registra con metodo y URL.
 * @returns {{success: false, message: string, error?: string}}
 *
 * @example
 * // En un catch de router:
 * return res.status(500).json(buildErrorResponse("Error al consultar embarques", error));
 */
function buildErrorResponse(message, error, { log = true } = {}) {
  if (error && log) {
    console.error(`[error] ${message}:`, error);
  }

  const response = {
    success: false,
    message,
  };

  if (error && ENTORNOS_CON_DETALLE.includes(env.nodeEnv)) {
    response.error = error.message;
  }

  return response;
}

module.exports = {
  buildErrorResponse,
};
