const CSRF_COOKIE_NAME = import.meta.env.VITE_CSRF_COOKIE_NAME || 'modulo_reportes_csrf';

function getCookieValue(name) {
  const cookies = document.cookie ? document.cookie.split('; ') : [];
  const prefix = `${name}=`;
  const cookie = cookies.find((item) => item.startsWith(prefix));

  return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : null;
}

export function getCsrfHeaders() {
  const token = getCookieValue(CSRF_COOKIE_NAME);

  return token ? { 'X-CSRF-Token': token } : {};
}
