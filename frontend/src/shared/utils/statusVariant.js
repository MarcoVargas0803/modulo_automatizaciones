/**
 * statusVariant — Deduce la variante de `Badge` a partir del texto de un estado.
 *
 * Heredero de la heurística que usaba el difunto `StatusBadge`: normaliza el
 * texto (quita acentos, pasa a mayúsculas) y busca palabras clave, cubriendo
 * variantes en español e inglés del mismo estado.
 *
 * **Solo para dominios abiertos.** Si los estados posibles se conocen —como los
 * cuatro de compras internacionales o los cuatro de ejecuciones— lo correcto es
 * un mapa explícito en la propia página, no adivinar a partir de la cadena. Este
 * helper existe para las tablas de `LogDetail` (eventos, transacciones y
 * aprobaciones), cuyos estados vienen del backend sin lista cerrada en el
 * frontend.
 *
 * El mapeo sigue la tabla canónica de `rule-decisions.md`: pendiente/en espera →
 * `warning`, en proceso/en tránsito → `info`, exitoso/completado → `success`,
 * error/rechazado → `error`, desconocido → `default`. **No conserva los colores
 * del antiguo `StatusBadge`**, que tenía invertidos pendiente y en proceso.
 *
 * ── Trampa ───────────────────────────────────────────────────────────────────
 * Compara por **subcadena y en orden**, así que la primera regla que coincida
 * gana: `INCOMPLETA` cae en `warning` por `INCOMPLET` antes de que `COMPLET`
 * pueda mandarla a `success`. Al añadir una palabra clave, comprobar que no
 * captura por accidente a las de una regla posterior.
 *
 * @param {string} status - Texto del estado. Un valor vacío o desconocido da `'default'`.
 * @returns {'default'|'success'|'error'|'warning'|'info'} Variante para `Badge`.
 *
 * @example
 * // En una celda de DataTable, con estados de dominio abierto
 * {
 *   header: 'Estado',
 *   accessor: 'status',
 *   cell: (row) => <Badge variant={statusVariant(row.status)} size="sm">{row.status}</Badge>,
 * }
 */

/** El orden importa: se aplica la primera regla cuya palabra clave aparezca. */
const STATUS_RULES = [
  { variant: 'error',   keywords: ['ERROR', 'FALL', 'FAILED', 'RECHAZ', 'REJECT', 'CANCEL'] },
  { variant: 'warning', keywords: ['PENDIENTE', 'PENDING', 'INCOMPLET', 'ESPERA', 'WAITING'] },
  { variant: 'success', keywords: ['EXITOS', 'SUCCESS', 'COMPLET', 'APROBAD', 'APPROVED', 'PROCESAD', 'FINALIZAD', 'TERMINAD'] },
  { variant: 'info',    keywords: ['PROCESO', 'TRANSIT', 'RUNNING', 'PROGRESS', 'EJECU'] },
];

export function statusVariant(status) {
  const normalized = String(status || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();

  if (!normalized) return 'default';

  const match = STATUS_RULES.find((rule) =>
    rule.keywords.some((keyword) => normalized.includes(keyword)),
  );

  return match ? match.variant : 'default';
}
