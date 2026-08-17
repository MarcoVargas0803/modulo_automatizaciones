import React from 'react';
import { BarChart3, AlertTriangle } from 'lucide-react';
import { Skeleton } from '@/shared/components/Skeleton/Skeleton';
import { EmptyState } from '@/shared/components/EmptyState/EmptyState';
import './ChartCard.css';

/**
 * ChartCard — Envoltorio de una sección con gráfica dentro del Dashboard.
 *
 * Reúne los cuatro estados por los que pasa toda sección de datos —cargando,
 * fallo reintentable, sin datos y contenido— sobre la misma `.dashboard-section`
 * que ya usan las demás secciones de la página, para que compartan borde, hover
 * y tipografía sin duplicar CSS.
 *
 * Vive en el módulo, no en `shared/`: por ahora solo lo consume el Dashboard.
 * Si aparece un segundo consumidor, ese es el momento de promoverlo.
 *
 * ── Trampas ──────────────────────────────────────────────────────────────────
 * - **La altura la fija `.chart-card-body` en píxeles, no el `ResponsiveContainer`.**
 *   `.dashboard-page` es un contenedor flex en columna, y ahí un
 *   `ResponsiveContainer` con altura porcentual colapsa a 0 y la gráfica
 *   desaparece sin error. Para cambiar el alto se pasa `height`, nunca un
 *   `height="100%"` en el contenedor de Recharts.
 * - **`isEmpty` se calcula fuera.** El componente no inspecciona `children`: una
 *   serie de ceros es un dato legítimo y no debe confundirse con ausencia de
 *   datos.
 *
 * @param {string}  title        - Título de la sección. Se emite como `<h2>`, igual que el resto.
 * @param {string}  [subtitle]   - Línea secundaria bajo el título.
 * @param {boolean} [isLoading]  - Muestra el placeholder y oculta el resto.
 * @param {string}  [error]      - Mensaje de fallo. Pinta `EmptyState tone="error"`.
 * @param {boolean} [isEmpty]    - Si es true, muestra el estado sin datos en vez de `children`.
 * @param {string}  [emptyMessage] - Descripción del estado sin datos.
 * @param {() => void} [onRetry] - Si se pasa, el estado de error ofrece «Reintentar».
 * @param {number}  [height]     - Alto del área de contenido en píxeles. (default: 280)
 * @param {React.ReactNode} [children] - La gráfica.
 * @param {string}  [className]  - Clases extra. (default: '')
 *
 * @example
 * <ChartCard
 *   title="Ejecuciones por día"
 *   subtitle="Últimos 30 días"
 *   isLoading={timeseries.isLoading}
 *   error={timeseries.error}
 *   isEmpty={!timeseries.data?.length}
 *   onRetry={timeseries.reload}
 * >
 *   <ResponsiveContainer width="100%" height="100%">…</ResponsiveContainer>
 * </ChartCard>
 */
export function ChartCard({
  title,
  subtitle,
  isLoading = false,
  error = null,
  isEmpty = false,
  emptyMessage = 'No hay datos para el periodo o el proceso seleccionado.',
  onRetry,
  height = 280,
  children,
  className = '',
}) {
  return (
    <section className={`dashboard-section ${className}`}>
      <div className="section-header">
        <div>
          <h2 className="section-title">{title}</h2>
          {subtitle && <p className="section-subtitle">{subtitle}</p>}
        </div>
      </div>

      <div className="chart-card-body" style={{ height: `${height}px` }}>
        {isLoading && (
          <Skeleton height={height - 16} borderRadius="var(--radius-md)" />
        )}

        {!isLoading && error && (
          <EmptyState
            tone="error"
            icon={AlertTriangle}
            title="No se pudo cargar esta sección"
            description={error}
            action={onRetry ? { label: 'Reintentar', onClick: onRetry } : undefined}
          />
        )}

        {!isLoading && !error && isEmpty && (
          <EmptyState
            icon={BarChart3}
            title="Sin datos que graficar"
            description={emptyMessage}
          />
        )}

        {!isLoading && !error && !isEmpty && children}
      </div>
    </section>
  );
}
