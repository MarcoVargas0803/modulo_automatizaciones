import React from 'react';
import { Inbox } from 'lucide-react';
import { Button } from '@/shared/components/Button/Button';
import './EmptyState.css';

/**
 * EmptyState — Bloque centrado para cuando no hay nada que mostrar.
 *
 * Ícono, título, descripción y CTA opcional. Todas sus props tienen valor por
 * defecto, así que `<EmptyState />` a secas ya funciona.
 *
 * Dos usos según `docs/DESIGN.md §4`: sin `action`, "no hay datos"; con
 * `action`, un fallo del que se puede reintentar.
 *
 * `tone` decide cómo lo anuncia el lector de pantalla: con el valor por defecto
 * `'empty'` va como `role="status"` (*polite*, no interrumpe); con `'error'`
 * pasa a `role="alert"` (*assertive*), que es lo que corresponde a un fallo de
 * carga y lo equipara a `Alert variant="error"`.
 *
 * ── Trampas ──────────────────────────────────────────────────────────────────
 * - **`tone` es opt-in.** El default sigue siendo `'empty'`, así que un fallo de
 *   carga se anuncia como *polite* mientras no se pase `tone="error"`. Siguen
 *   pendientes de migrar `Dashboard`, `Logs`, `LogDetail`,
 *   `InternationalPurchases` y `MaterialRevaluations`.
 * - **`action.variant` inválido cae en `'secondary'` en silencio.** No avisa en
 *   consola; solo se nota porque el botón no tiene el color esperado.
 *
 * @param {LucideIcon}  icon          - Componente de icono, no elemento. Se pinta a 48px. (default: Inbox)
 * @param {string}      title         - Título. Se usa además como `aria-label` del bloque. (default: 'Sin resultados')
 * @param {string}      description   - Texto secundario. Pasar cadena vacía lo oculta. (default: 'No hay registros para mostrar.')
 * @param {'empty'|'error'} tone      - Cómo se anuncia: `'empty'` → `role="status"`; `'error'` → `role="alert"`. (default: 'empty')
 * @param {{ label: string, onClick: () => void, variant?: string }} [action] - CTA opcional. Se delega en `Button`; `variant` fuera de la lista válida cae a 'secondary'.
 * @param {string}      className     - Clases extra para el contenedor `.empty-state`. (default: '')
 * @param {React.ReactNode} [children] - Contenido extra bajo la acción.
 *
 * @example
 * // Sin resultados tras aplicar filtros
 * <EmptyState
 *   icon={SearchX}
 *   title="Sin coincidencias"
 *   description="Ningún registro coincide con los filtros aplicados."
 * />
 *
 * @example
 * // Fallo de carga reintentable: pasar tone="error" para que se anuncie como tal
 * <EmptyState
 *   tone="error"
 *   title="Error al cargar el Dashboard"
 *   description="No se pudo obtener el resumen operativo."
 *   action={{ label: 'Reintentar', onClick: recargar }}
 * />
 */

/** Variantes que `Button` sabe pintar; el resto no tiene clase en `Button.css`. */
const BUTTON_VARIANTS = ['primary', 'secondary', 'ghost', 'danger', 'icon'];

export function EmptyState({
  icon: Icon = Inbox,
  title = 'Sin resultados',
  description = 'No hay registros para mostrar.',
  tone = 'empty',
  action,
  className = '',
  children,
}) {
  const actionVariant = BUTTON_VARIANTS.includes(action?.variant)
    ? action.variant
    : 'secondary';

  return (
    <div
      className={`empty-state ${className}`}
      role={tone === 'error' ? 'alert' : 'status'}
      aria-label={title}
    >
      <Icon className="empty-state-icon" size={48} aria-hidden="true" />
      <p className="empty-state-title">{title}</p>
      {description && (
        <p className="empty-state-description">{description}</p>
      )}
      {action && (
        <Button variant={actionVariant} onClick={action.onClick}>
          {action.label}
        </Button>
      )}
      {children}
    </div>
  );
}
