import { getCsrfHeaders } from './csrf';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function apiFetch(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const headers = { ...(options.headers || {}) };

  if (options.body != null && !(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  if (MUTATING_METHODS.has(method)) {
    Object.assign(headers, getCsrfHeaders());
  }

  return fetch(path, {
    ...options,
    method,
    credentials: 'include',
    headers,
  }).then((response) => {
    // El logout se excluye a propósito: cerrar sesión sobre una sesión ya revocada
    // responde 401, y eso reabriría el aviso de sesión caducada justo mientras el
    // usuario sale. Un 401 ahí no es una expiración, es el resultado esperado.
    if (response.status === 401 && !path.endsWith('/auth/logout')) {
      // El 401 lleva ahora un `code` que distingue "te expulsaron" de "caducó".
      // Se lee sobre un clon para no consumir el cuerpo que espera quien llamó, y
      // el evento se emite igual si el cuerpo no es JSON: perder el motivo no
      // debe impedir avisar de que la sesión murió.
      response
        .clone()
        .json()
        .catch(() => ({}))
        .then((data) => {
          window.dispatchEvent(
            new CustomEvent('session:expired', { detail: { code: data?.code } }),
          );
        });
    }
    return response;
  });
}
