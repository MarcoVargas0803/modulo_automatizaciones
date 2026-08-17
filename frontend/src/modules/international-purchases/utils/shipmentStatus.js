/**
 * Estatus de embarque → variante de `Badge`.
 *
 * El dominio es cerrado y lo fija el backend: son los cuatro valores que ofrece
 * el filtro «Estatus» de la barra y que explica el `Hint` de la columna. Por
 * eso aquí va un mapa explícito y no la heurística de
 * `@/shared/utils/statusVariant`, que es para estados de dominio abierto.
 *
 * Sigue la tabla canónica de `rule-decisions.md`: planeado (aún no ha salido) →
 * `warning`, en tránsito → `info`, entregado → `success`, desconocido →
 * `default`.
 *
 * Antes de esto la columna usaba `StatusBadge`, que deducía el color buscando
 * palabras clave en el texto: de los cuatro estatus **solo `IN_TRANSIT`
 * coincidía con alguna**, así que `PLANNED`, `DELIVERED` y `UNKNOWN` salían en
 * gris y el badge era prácticamente decorativo.
 *
 * @param {string} status - Estatus crudo del embarque.
 * @returns {'default'|'success'|'warning'|'info'} Variante para `Badge`.
 *
 * @example
 * <Badge variant={shipmentStatusVariant(row.shipment_status)} size="sm">
 *   {row.shipment_status}
 * </Badge>
 */
const SHIPMENT_STATUS_VARIANTS = {
  PLANNED: 'warning',
  IN_TRANSIT: 'info',
  DELIVERED: 'success',
  UNKNOWN: 'default',
};

export function shipmentStatusVariant(status) {
  return SHIPMENT_STATUS_VARIANTS[status] ?? 'default';
}
