import { AlertOctagon, AlertTriangle, Info } from 'lucide-react';

/**
 * Gravedad de una advertencia de embarque → variante e icono de `Badge`.
 *
 * Hermano de `shipmentStatus.js`: mismo papel, pero para la columna
 * «Advertencias» en vez de la de estatus. Vive aquí y no en `shared/` porque
 * solo compras internacionales tiene catálogo de advertencias.
 *
 * ── Por qué hace falta una lista blanca ──────────────────────────────────────
 * `severity` llega de `international_purchases.warning_catalog`, donde es una
 * columna `text` **sin CHECK ni enum** y con `'info'` de defecto. Acaba siendo
 * un nombre de variante de `Badge`, así que un valor inesperado no se concatena
 * nunca: se degrada a `info`. Un código sin entrada en el catálogo cae en el
 * mismo sitio, porque sin catálogo no hay gravedad que consultar.
 *
 * Los tres nombres coinciden a propósito con las variantes de `Badge`, así que
 * la gravedad se usa tal cual como `variant`. El icono **refuerza** el color,
 * no compite con él: por eso se elige por gravedad y no por código.
 *
 * @param {{severity?: string}} [entry] - Entrada del catálogo. Sin ella devuelve `'info'`.
 * @returns {'info'|'warning'|'error'} Gravedad válida, utilizable como `variant` de `Badge`.
 *
 * @example
 * const severity = warningSeverity(warningCatalogMap[code]);
 * <Badge
 *   variant={severity}
 *   size="sm"
 *   icon={WARNING_SEVERITY_ICON[severity]}
 *   hint={warningCatalogMap[code]?.label_es || code}
 * >
 *   {code}
 * </Badge>
 */
const WARNING_SEVERITIES = ['info', 'warning', 'error'];

export const WARNING_SEVERITY_ICON = {
  info: Info,
  warning: AlertTriangle,
  error: AlertOctagon,
};

export function warningSeverity(entry) {
  return WARNING_SEVERITIES.includes(entry?.severity) ? entry.severity : 'info';
}
