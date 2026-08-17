import React, { useMemo } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { ClipboardCheck, Activity, Bug } from 'lucide-react';
import { Skeleton } from '@/shared/components/Skeleton/Skeleton';
import { statusVariant } from '@/shared/utils/statusVariant';
import { relativeTime } from '@/shared/utils/relativeTime';
import './ActivityTimeline.css';

const STATUS_DOT_TONE = {
  success: 'success',
  error: 'error',
  warning: 'warning',
  info: 'info',
  default: 'neutral',
};

/**
 * ActivityTimeline — la zona «Bitácora» de una estación de la Consola.
 *
 * No son dos listas separadas: es un único feed cronológico, más reciente
 * arriba, mezclando dos fuentes que el Dashboard ya trae —sin llamada
 * nueva—: ejecuciones recientes (`created_at_mx`) y errores frecuentes
 * (`last_seen`, columna real de `/api/dashboard/top-errors`, hoy sin usar).
 *
 * Las revaluaciones pendientes no entran al feed: no hay timestamp por ítem
 * individual (solo un contador ya poll-eado en `DashboardLayout`), así que
 * quedan como aviso fijo arriba en vez de fabricar una fecha que no existe.
 *
 * Vive en `modules/executions/components/`: Dashboard es su único
 * consumidor. Conserva superficie propia (sombra) porque cumple una función
 * real — es sticky, se queda fija mientras el resto de la página se mueve.
 *
 * @param {Object[]} executions            - Filas de `executionsData` (ya limitadas a 5).
 * @param {boolean}  isLoadingExecutions
 * @param {Object[]} topErrors              - `topErrorRows`, con `label`, `error_count`, `event_name`, `last_seen`.
 * @param {boolean}  isLoadingTopErrors
 * @param {boolean}  canAccessRevaluations
 * @param {number}   pendingRevaluations
 * @param {string}   className
 */
export function ActivityTimeline({
  executions = [],
  isLoadingExecutions = false,
  topErrors = [],
  isLoadingTopErrors = false,
  canAccessRevaluations = false,
  pendingRevaluations = 0,
  className = '',
}) {
  const isLoading = isLoadingExecutions || isLoadingTopErrors;

  const entries = useMemo(() => {
    const fromExecutions = executions
      .filter((row) => row.created_at_mx)
      .map((row) => ({
        id: `exec-${row.execution_id}`,
        timestamp: row.created_at_mx,
        tone: STATUS_DOT_TONE[statusVariant(row.display_status)] || 'neutral',
        source: 'execution',
        title: row.process_name,
        subtitle: row.execution_id,
        href: `/logs/${row.execution_id}`,
      }));

    const fromErrors = topErrors
      .filter((row) => row.last_seen)
      .map((row) => ({
        id: `error-${row.label}-${row.last_seen}`,
        timestamp: row.last_seen,
        tone: 'error',
        source: 'node',
        title: row.label,
        subtitle: row.event_name && row.event_name !== '(sin evento)'
          ? row.event_name
          : `${row.error_count} error${row.error_count === 1 ? '' : 'es'}`,
        href: null,
      }));

    return [...fromExecutions, ...fromErrors]
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 8);
  }, [executions, topErrors]);

  return (
    <aside className={`timeline-panel ${className}`}>
      {canAccessRevaluations && pendingRevaluations > 0 && (
        <RouterLink to="/revaluaciones" className="timeline-pending-banner">
          <ClipboardCheck size={16} aria-hidden="true" />
          <span>
            {pendingRevaluations} revaluacion{pendingRevaluations === 1 ? '' : 'es'} pendiente
            {pendingRevaluations === 1 ? '' : 's'} de revisar
          </span>
        </RouterLink>
      )}

      <h3 className="timeline-title">Actividad reciente</h3>

      {isLoading && (
        <ol className="timeline-list">
          {Array.from({ length: 4 }).map((_, index) => (
            <li key={index} className="timeline-item">
              <span className={`timeline-dot timeline-dot-neutral`} aria-hidden="true" />
              <Skeleton width="100%" height={14} />
            </li>
          ))}
        </ol>
      )}

      {!isLoading && entries.length === 0 && (
        <p className="timeline-empty">Sin actividad reciente que mostrar.</p>
      )}

      {!isLoading && entries.length > 0 && (
        <ol className="timeline-list">
          {entries.map((entry, index) => {
            const isLast = index === entries.length - 1;
            // Ejecución (negocio, ya la corrió el proceso) vs. nodo con error
            // (técnico, dentro del flujo de n8n) — misma paleta semántica de
            // siempre, ahora con forma además de color, no un tono nuevo.
            const SourceIcon = entry.source === 'node' ? Bug : Activity;
            const content = (
              <>
                <span className={`timeline-dot timeline-dot-${entry.tone}`} aria-hidden="true" />
                <span className="timeline-content">
                  <span className="timeline-content-title">
                    <SourceIcon size={12} className={`timeline-content-icon timeline-content-icon-${entry.tone}`} aria-hidden="true" />
                    {entry.title}
                  </span>
                  <span className="timeline-content-subtitle">{entry.subtitle}</span>
                </span>
                <span className="timeline-time">{relativeTime(entry.timestamp)}</span>
              </>
            );

            return (
              <li key={entry.id} className={`timeline-item ${isLast ? 'timeline-item--last' : ''}`}>
                {entry.href ? (
                  <RouterLink to={entry.href} className="timeline-item-link">
                    {content}
                  </RouterLink>
                ) : (
                  <div className="timeline-item-static">{content}</div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </aside>
  );
}
