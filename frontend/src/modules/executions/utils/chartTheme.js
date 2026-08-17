/**
 * Estilos compartidos por todas las gráficas del Dashboard.
 *
 * Los colores se pasan como `var(--token)`: los atributos de presentación de SVG
 * aceptan `var()`, así que el tema oscuro se resuelve solo cuando
 * `:root[data-theme="dark"]` redeclara los tokens. No hay una sola regla de tema
 * escrita a mano para las gráficas, y no debe haberla.
 */

export const CHART_GRID_STROKE = 'var(--color-divider)';

export const CHART_AXIS_TICK = {
  fill: 'var(--color-muted-text)',
  fontSize: 12,
};

export const CHART_AXIS_LINE = {
  stroke: 'var(--color-outline-variant)',
};

export const CHART_TOOLTIP_CONTENT_STYLE = {
  background: 'var(--color-surface-elevated)',
  border: '1px solid var(--color-outline-variant)',
  borderRadius: 'var(--radius-md)',
  boxShadow: 'var(--shadow-2)',
  fontFamily: 'var(--font-label)',
  fontSize: '13px',
};

export const CHART_TOOLTIP_LABEL_STYLE = {
  color: 'var(--color-on-surface)',
  fontWeight: 700,
  marginBottom: '4px',
};

export const CHART_TOOLTIP_ITEM_STYLE = {
  color: 'var(--color-on-surface-variant)',
};

export const CHART_TOOLTIP_CURSOR = {
  fill: 'var(--color-surface-variant)',
  fillOpacity: 0.45,
};

/**
 * Series de estado de ejecución. El color sale del mapeo canónico de
 * `rule-decisions.md` —el mismo que usa `statusVariant` para los `Badge`—, así
 * que la gráfica y la tabla de abajo dicen lo mismo con el mismo color.
 */
export const EXECUTION_STATUS_SERIES = [
  { key: 'successful', label: 'Exitosas', color: 'var(--color-success)' },
  { key: 'errors', label: 'Con error', color: 'var(--color-error)' },
  { key: 'in_progress', label: 'En proceso', color: 'var(--color-info)' },
  { key: 'incomplete', label: 'Incompletas', color: 'var(--color-warning)' },
  { key: 'other', label: 'Otro estado', color: 'var(--color-muted-text)' },
];

/**
 * Paleta categórica, solo para categorías SIN semántica de estado (navieras,
 * campos de tracking). Si la categoría es un estado, va con los tokens
 * semánticos de arriba.
 */
export const CHART_CATEGORICAL_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--chart-6)',
];

export function categoricalColor(index) {
  return CHART_CATEGORICAL_COLORS[index % CHART_CATEGORICAL_COLORS.length];
}

/**
 * `pg` devuelve COUNT, SUM y percentile_cont como cadena. Sin esta coerción los
 * acumuladores del cliente concatenan en vez de sumar: `"0" + "12.5" + "3.2"` da
 * `"012.53.2"`, que acaba en NaN.
 */
export function num(value) {
  return Number(value) || 0;
}

/** Etiqueta corta de eje para una fecha ISO `YYYY-MM-DD`, sin tocar zonas. */
export function shortDateLabel(isoDate) {
  if (typeof isoDate !== 'string' || isoDate.length < 10) {
    return '';
  }

  return `${isoDate.slice(8, 10)}/${isoDate.slice(5, 7)}`;
}
