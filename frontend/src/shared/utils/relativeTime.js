const UNITS = [
  ['year', 60 * 60 * 24 * 365],
  ['month', 60 * 60 * 24 * 30],
  ['day', 60 * 60 * 24],
  ['hour', 60 * 60],
  ['minute', 60],
];

const formatter = typeof Intl !== 'undefined' && Intl.RelativeTimeFormat
  ? new Intl.RelativeTimeFormat('es-MX', { numeric: 'auto' })
  : null;

/**
 * relativeTime — "hace 4 min" / "hace 2 h" a partir de una fecha pasada.
 *
 * Envuelve `Intl.RelativeTimeFormat` (nativo, sin dependencia) con la unidad
 * más legible para la distancia real, en vez de forzar siempre minutos u
 * horas. Para el futuro o sin fecha devuelve `'ahora'`, nunca un negativo
 * confuso ("hace -3 min").
 *
 * @param {string|Date} date - Fecha pasada. `null`/`undefined`/inválida → `'ahora'`.
 * @returns {string}
 *
 * @example
 * relativeTime(row.created_at_mx) // "hace 4 min"
 */
export function relativeTime(date) {
  if (!date || !formatter) return 'ahora';

  const timestamp = date instanceof Date ? date.getTime() : new Date(date).getTime();
  if (Number.isNaN(timestamp)) return 'ahora';

  const diffSeconds = Math.round((timestamp - Date.now()) / 1000);
  if (diffSeconds > -30) return 'ahora';

  for (const [unit, secondsInUnit] of UNITS) {
    if (Math.abs(diffSeconds) >= secondsInUnit) {
      return formatter.format(Math.round(diffSeconds / secondsInUnit), unit);
    }
  }

  return formatter.format(Math.round(diffSeconds / 60), 'minute');
}
