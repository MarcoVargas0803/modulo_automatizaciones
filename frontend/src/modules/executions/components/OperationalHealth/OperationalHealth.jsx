import React, { useMemo } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';
import { Alert } from '@/shared/components/Alert/Alert';
import {
  CHART_AXIS_TICK, CHART_AXIS_LINE, CHART_GRID_STROKE,
  CHART_TOOLTIP_CONTENT_STYLE, CHART_TOOLTIP_LABEL_STYLE, CHART_TOOLTIP_ITEM_STYLE, CHART_TOOLTIP_CURSOR,
  EXECUTION_STATUS_SERIES, num,
} from '@/modules/executions/utils/chartTheme';
import './OperationalHealth.css';

/**
 * OperationalHealth — la zona «Señal» de una estación de la Consola.
 *
 * Un solo número protagonista (Tasa de Éxito) con su tendencia, y todo lo
 * demás como texto de apoyo alrededor — nunca ocho cajas del mismo tamaño
 * compitiendo (Parte VII, principio 1). Vive directo sobre el lienzo, sin
 * caja propia (Parte IV).
 *
 * La tendencia se calcula en cliente, sobre los mismos 30 días que ya trae
 * `/api/dashboard/timeseries` (últimos 7 días vs. los 7 anteriores) — sin
 * endpoint nuevo.
 *
 * @param {string}   successRateLabel      - Ej. "94%", ya formateado por Dashboard.jsx.
 * @param {Object[]} timeseriesRows         - Filas de `/api/dashboard/timeseries`, ascendentes por fecha.
 * @param {Object[]} stats                  - `{ id, label, value, tone, linkText, linkHref }[]` — el riel de cifras secundarias.
 * @param {boolean}  showByProcess
 * @param {Object[]} byProcessRows
 * @param {number}   otherExecutions
 */
export function OperationalHealth({
  successRateLabel,
  timeseriesRows = [],
  stats = [],
  showByProcess = false,
  byProcessRows = [],
  otherExecutions = 0,
}) {
  const trend = useMemo(() => {
    if (timeseriesRows.length < 14) return null;

    const rate = (rows) => {
      const totals = rows.reduce(
        (acc, row) => ({ total: acc.total + num(row.total), ok: acc.ok + num(row.successful) }),
        { total: 0, ok: 0 },
      );
      return totals.total > 0 ? totals.ok / totals.total : null;
    };

    const recent = rate(timeseriesRows.slice(-7));
    const previous = rate(timeseriesRows.slice(-14, -7));
    if (recent == null || previous == null) return null;

    const deltaPoints = Math.round((recent - previous) * 100);
    if (deltaPoints === 0) return { direction: 'flat', label: 'sin cambio vs. semana anterior' };

    return {
      direction: deltaPoints > 0 ? 'up' : 'down',
      label: `${deltaPoints > 0 ? '+' : ''}${deltaPoints} pp vs. semana anterior`,
    };
  }, [timeseriesRows]);

  return (
    <section className="health" aria-label="Salud operativa">
      <div className="health-hero">
        <span className="health-hero-label">Tasa de Éxito</span>
        <div className="health-hero-row">
          <span className="health-hero-value">{successRateLabel}</span>
          {trend && trend.direction !== 'flat' && (
            <span className={`health-trend health-trend-${trend.direction}`}>
              {trend.direction === 'up' ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
              {trend.label}
            </span>
          )}
          {trend && trend.direction === 'flat' && (
            <span className="health-trend health-trend-flat">{trend.label}</span>
          )}
        </div>
      </div>

      <div className="health-stat-rail">
        {stats.map((stat) => {
          const content = (
            <>
              <span className="health-stat-label">{stat.label}</span>
              <span className={`health-stat-value ${stat.tone ? `health-stat-${stat.tone}` : ''}`}>
                {stat.value}
              </span>
            </>
          );

          return stat.linkHref ? (
            <RouterLink key={stat.id} to={stat.linkHref} className="health-stat health-stat--link">
              {content}
            </RouterLink>
          ) : (
            <div key={stat.id} className="health-stat">
              {content}
            </div>
          );
        })}
      </div>

      {showByProcess && byProcessRows.length > 0 && (
        <div className="health-byprocess">
          <span className="health-byprocess-label">Distribución por proceso</span>
          <div className="health-byprocess-chart">
            <ResponsiveContainer width="100%" height={Math.max(90, byProcessRows.length * 34)}>
              <BarChart data={byProcessRows} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 0 }} accessibilityLayer>
                <CartesianGrid stroke={CHART_GRID_STROKE} strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="process_name" width={140} tick={CHART_AXIS_TICK} axisLine={CHART_AXIS_LINE} tickLine={false} />
                <Tooltip
                  cursor={CHART_TOOLTIP_CURSOR}
                  contentStyle={CHART_TOOLTIP_CONTENT_STYLE}
                  labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                  itemStyle={CHART_TOOLTIP_ITEM_STYLE}
                />
                {EXECUTION_STATUS_SERIES.map((serie) => (
                  <Bar key={serie.key} dataKey={serie.key} name={serie.label} stackId="estado" fill={serie.color} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {otherExecutions > 0 && (
        <Alert variant="warning">
          {otherExecutions} ejecuciones con un estado fuera del vocabulario — cuentan en el total,
          no en la Tasa de Éxito.
        </Alert>
      )}
    </section>
  );
}
