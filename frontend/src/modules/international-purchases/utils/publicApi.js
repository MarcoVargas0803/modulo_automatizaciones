// Cliente HTTP del registro externo de embarques.
//
// NO usa apiFetch a proposito. `shared/utils/apiClient.js` despacha el evento
// `session:expired` ante cualquier 401, y ese evento levanta el
// SessionExpiredModal: a un forwarder anonimo —que nunca tuvo sesion— le
// saldria un modal pidiendole que vuelva a iniciar sesion cuando lo que pasa
// es que su enlace ya no sirve. Aqui un 401 significa "enlace invalido", no
// "sesion caducada", y son mensajes distintos.
//
// Es el mismo criterio que sigue PaymentProposalReview, la otra pagina publica
// del proyecto: llama a `fetch` directo.
//
// Tampoco manda cookies ni cabecera CSRF: no hay sesion que enviar y el
// backend no valida CSRF en estas rutas (la credencial va en un header, que un
// formulario de otro sitio no puede fijar sin pasar por CORS).

const INVITE_HEADER = 'X-Shipment-Invite-Token';

/**
 * Lee el token del fragmento de la URL.
 *
 * El fragmento (`#token=…`) no viaja al servidor: no aparece en los logs de
 * acceso ni en la cabecera Referer al navegar fuera. Por eso el backend lo
 * emite ahi y no en la query.
 *
 * @returns {string} El token, o cadena vacia si el enlace no lo trae.
 */
export function readInviteToken() {
  const fromHash = new URLSearchParams(
    window.location.hash.replace(/^#/, ''),
  ).get('token');

  return fromHash || '';
}

/**
 * Construye un fetcher con el token ya incorporado.
 *
 * Se pasa como prop `fetcher` a ShipmentFormModal para que el mismo formulario
 * sirva al operador (con apiFetch y sesion) y al forwarder (con esto), sin que
 * el componente sepa cual de los dos lo esta usando.
 *
 * @param {string} token Token del enlace de registro.
 * @returns {(path: string, options?: RequestInit) => Promise<Response>}
 */
export function createInviteFetcher(token) {
  return function inviteFetch(path, options = {}) {
    const headers = { ...options.headers };

    if (options.body != null && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    headers[INVITE_HEADER] = token;

    return fetch(path, { ...options, headers });
  };
}

/**
 * Normaliza la respuesta del backend a una forma unica.
 *
 * Las rutas publicas devuelven `{ success, message, errors?, reason? }` y hay
 * tres familias de fallo que la pagina trata distinto: enlace invalido (401),
 * enlace dormido (403) y datos mal capturados (400 con `errors`). Resolverlo
 * aqui evita repetir el mismo `if` en cada llamada.
 *
 * @param {Response} response
 * @returns {Promise<{ok: boolean, status: number, data: any, message: string, errors: string[], reason: string|null}>}
 */
export async function readJsonResponse(response) {
  let payload = null;

  try {
    payload = await response.json();
  } catch {
    // Un 502 de un proxy o una caida devuelven HTML, no JSON. Sin este catch
    // el error que ve el usuario seria un SyntaxError de parseo, que no dice
    // nada de lo que paso.
    payload = null;
  }

  return {
    ok: response.ok && payload?.success === true,
    status: response.status,
    data: payload?.data ?? null,
    message: payload?.message || 'No se pudo completar la operación. Intente de nuevo.',
    errors: Array.isArray(payload?.errors) ? payload.errors : [],
    reason: payload?.reason || null,
  };
}
