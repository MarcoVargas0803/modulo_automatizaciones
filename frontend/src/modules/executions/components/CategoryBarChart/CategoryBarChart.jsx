import React from 'react';
import {
  ResponsiveContainer, BarChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import {
  CHART_GRID_STROKE,
  CHART_AXIS_TICK,
  CHART_AXIS_LINE,
  CHART_TOOLTIP_CONTENT_STYLE,
  CHART_TOOLTIP_LABEL_STYLE,
  CHART_TOOLTIP_ITEM_STYLE,
  CHART_TOOLTIP_CURSOR,
} from '@/modules/executions/utils/chartTheme';

/**
 * CategoryBarChart — Gráfica de barras de una sola serie a partir del descriptor
 * `chart` que produce `buildProcessKpis` (`{ data, layout, valueName, formatValue }`).
 *
 * Extraída del Dashboard para que la comparta con la vista de auditoría por
 * proceso sin duplicar el render de Recharts. Debe ir dentro de un contenedor con
 * alto fijo (un `ResponsiveContainer` con alto porcentual colapsa a 0 en un flex
 * en columna).
 *
 * @param {{data: object[], layout?: 'horizontal'|'vertical', valueName: string, formatValue?: (v:number)=>string}} chart
 */
export function CategoryBarChart({ chart }) {
  const isVertical = chart.layout === 'vertical';

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={chart.data}
        layout={isVertical ? 'vertical' : 'horizontal'}
        margin={{ top: 8, right: 16, bottom: 8, left: isVertical ? 24 : 0 }}
        accessibilityLayer
      >
        <CartesianGrid stroke={CHART_GRID_STROKE} strokeDasharray="3 3" vertical={!isVertical} />
        {isVertical ? (
          <>
            <XAxis type="number" tick={CHART_AXIS_TICK} axisLine={CHART_AXIS_LINE} tickLine={CHART_AXIS_LINE} allowDecimals={false} />
            <YAxis type="category" dataKey="name" width={120} tick={CHART_AXIS_TICK} axisLine={CHART_AXIS_LINE} tickLine={CHART_AXIS_LINE} />
          </>
        ) : (
          <>
            <XAxis dataKey="name" tick={CHART_AXIS_TICK} axisLine={CHART_AXIS_LINE} tickLine={CHART_AXIS_LINE} interval={0} />
            <YAxis tick={CHART_AXIS_TICK} axisLine={CHART_AXIS_LINE} tickLine={CHART_AXIS_LINE} allowDecimals={false} />
          </>
        )}
        <Tooltip
          cursor={CHART_TOOLTIP_CURSOR}
          contentStyle={CHART_TOOLTIP_CONTENT_STYLE}
          labelStyle={CHART_TOOLTIP_LABEL_STYLE}
          itemStyle={CHART_TOOLTIP_ITEM_STYLE}
          formatter={(value) => [chart.formatValue ? chart.formatValue(value) : value, chart.valueName]}
        />
        <Bar dataKey="value" name={chart.valueName} radius={[4, 4, 0, 0]}>
          {chart.data.map((row) => (
            <Cell key={row.name} fill={row.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
