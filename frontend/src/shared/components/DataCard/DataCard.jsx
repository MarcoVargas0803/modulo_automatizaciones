import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { ArrowUpRight, ArrowDownRight, Link } from 'lucide-react';
import { Skeleton } from '@/shared/components/Skeleton/Skeleton';
import './DataCard.css';

/**
 * DataCard — Tarjeta de métrica: icono, etiqueta, valor grande y enlace opcional.
 *
 * Es la pieza con la que el `Dashboard` arma su fila de indicadores. Ninguna
 * prop es obligatoria y ninguna se valida: la tarjeta se pinta igual con datos
 * incompletos, dejando huecos.
 *
 * La tendencia tiene tres estados: `'up'` pinta flecha arriba en verde, `'down'`
 * flecha abajo en rojo, y **cualquier otro valor —incluido `undefined`— es
 * neutro**: la cifra sale atenuada y sin flecha. Un `trend` mal escrito ya no
 * miente, solo se abstiene.
 *
 * ── Trampas ──────────────────────────────────────────────────────────────────
 * - **Quien decide si la tendencia aparece es `trendValue`, no `trend`.** Con
 *   `trendValue={0}` o cadena vacía el bloque entero desaparece.
 * - **`linkText` y `linkHref` van juntos o no van.** `linkHref` sin `linkText`
 *   no pinta el pie y pierde el enlace en silencio. Al revés es peor:
 *   `linkText` sin `linkHref` cae en `<Link to="#">`, que navega a la raíz y
 *   saca al usuario de la pantalla en la que estaba.
 * - **`Dashboard.css` pisa `.data-card-title`** con otro tamaño y otro peso.
 *   Como las hojas son globales, el tamaño real del título depende del orden de
 *   carga, no de este componente.
 *
 * El tipo de enlace se decide solo: si `linkHref` empieza por `http(s)` usa un
 * `<a>`; si no, un `<Link>` de React Router.
 *
 * `tone` da color semántico a la tarjeta: pinta una barra lateral y el icono con
 * el token de la familia correspondiente. Se llama `tone` y no `variant` porque
 * `EmptyState` ya usa ese nombre con esta misma semántica, mientras que
 * `variant` está tomado por `Button` y `Badge` con otro significado. El mapeo
 * estado → familia es el de `rule-decisions.md`; no inventar uno nuevo.
 *
 * `tone="neutral"` (el valor por defecto) **no emite ninguna regla CSS**, así que
 * una tarjeta sin `tone` se ve exactamente igual que antes de existir la prop.
 *
 * Mantenimiento conserva una implementación propia de este mismo patrón
 * (`.summary-card`, en `MaintenanceDashboard`). Lo que la motivó era la falta de
 * color semántico, que `tone` ya cubre: migrarla está pendiente. Las otras dos
 * (`.kpi-summary-card` y `.kpi-obs-stat`) desaparecieron al absorberse
 * /mantenimiento/kpis en la pestaña «Mantenimiento» del Dashboard general.
 *
 * ── Estado de carga ──────────────────────────────────────────────────────────
 * `isLoading` pinta **esta misma tarjeta** con un `Skeleton` en el hueco del
 * título y de la cifra, en lugar de delegar en un placeholder aparte. Así la
 * caja (padding, borde, radio, tema oscuro) sale de `DataCard.css` y no quedan
 * dos versiones del mismo diseño que mantener sincronizadas. `icon` y `tone` se
 * siguen pintando si se pasan: son datos que la página ya conoce antes de la
 * respuesta. `trendValue` no, porque viene del servidor.
 *
 * @param {boolean}          isLoading    - Pinta la tarjeta con placeholders en vez de datos. (default: false)
 * @param {string}           [title]      - Etiqueta de la métrica. Sin guarda: si falta, queda un hueco.
 * @param {React.ReactNode}  [value]      - El dato. En el sistema real siempre se pasa ya formateado.
 * @param {LucideIcon}       [icon]       - Componente de icono, no elemento. Se pinta a 16px.
 * @param {'up'|'down'}      [trend]      - Dirección. `'up'` positivo, `'down'` negativo; cualquier otro valor, neutro y sin flecha.
 * @param {string}           [trendValue] - Texto de la variación. Es quien decide si el bloque de tendencia aparece.
 * @param {'neutral'|'success'|'warning'|'error'|'info'|'stuck'} [tone] - Color semántico. Un valor desconocido cae a `'neutral'`. `stuck` es un tono propio para "atascado/bloqueado", sin usar por defecto en ninguna tarjeta hoy. (default: 'neutral')
 * @param {string}           [linkText]   - Texto del enlace del pie. Sin él no hay pie, aunque haya `linkHref`.
 * @param {string}           [linkHref]   - Destino. `http(s)` → `<a>`; cualquier otra cosa → `<Link>` de router.
 * @param {string}           className    - Clases extra. (default: '')
 *
 * @example
 * // Como se usa en el Dashboard
 * <DataCard
 *   title="Total Ejecuciones"
 *   value="1,284"
 *   icon={Package}
 *   linkText="Ver reporte completo"
 *   linkHref="/logs"
 * />
 *
 * @example
 * // Con tendencia: sin `trend` la cifra sale neutra, no negativa
 * <DataCard title="Ejecuciones" value="1,284" icon={Package} trend="up" trendValue="+12%" />
 *
 * @example
 * // Métrica de riesgo: el color la separa de las neutras de su misma fila
 * <DataCard title="ETA vencida" value="3" icon={AlertTriangle} tone="error" />
 */
const TONES = ['success', 'warning', 'error', 'info', 'stuck'];

export function DataCard({ title, value, icon: Icon, trend, trendValue, tone = 'neutral', linkText, linkHref, className = '', isLoading = false }) {
  const trendClass = trend === 'up'
    ? 'trend-positive'
    : trend === 'down'
      ? 'trend-negative'
      : 'trend-neutral';
  const isExternalLink = /^https?:\/\//.test(linkHref || '');
  // Un tono desconocido no pinta nada, igual que un `trend` mal escrito: se
  // abstiene en vez de mentir con un color que no corresponde.
  const toneClass = TONES.includes(tone) ? `data-card-${tone}` : '';

  if (isLoading) {
    return (
      <div className={`data-card ${toneClass} ${className}`} aria-busy="true">
        <div className="data-card-header">
          <div className="data-card-title-group">
            {Icon && <Icon className="data-card-icon" size={16} />}
            <span className="data-card-title"><Skeleton width="70%" /></span>
          </div>
        </div>
        <div className="data-card-content">
          {/* .data-card-value ya lleva line-height: 1, así que el bloque sale con
              los 32px de la cifra y la tarjeta no crece de más. */}
          <div className="data-card-value"><Skeleton width="55%" /></div>
        </div>
        {linkText && (
          <div className="data-card-footer">
            <Skeleton width="45%" height={14} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`data-card ${toneClass} ${className}`}>
      <div className="data-card-header">
        <div className="data-card-title-group">
          {Icon && <Icon className="data-card-icon" size={16} />}
          <span className="data-card-title">{title}</span>
        </div>
      </div>
      <div className="data-card-content">
        <div className="data-card-value">{value}</div>
        {trendValue && (
          <div className={`data-card-trend ${trendClass}`}>
            {trend === 'up' && <ArrowUpRight size={16} />}
            {trend === 'down' && <ArrowDownRight size={16} />}
            <span>{trendValue}</span>
          </div>
        )}
      </div>
      {linkText && (
        <div className="data-card-footer">
          {isExternalLink ? (
            <a href={linkHref} className="data-card-link">
              {linkText}
              <Link size={14} />
            </a>
          ) : (
            <RouterLink to={linkHref || '#'} className="data-card-link">
              {linkText}
              <Link size={14} />
            </RouterLink>
          )}
        </div>
      )}
    </div>
  );
}
