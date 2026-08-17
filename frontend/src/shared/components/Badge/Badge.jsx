import React from 'react';
import { Hint } from '@/shared/components/Hint/Hint';
import './Badge.css';

/**
 * Badge — Píldora de estado. Etiqueta semántica reutilizable.
 *
 * Es el componente **canónico** y ya el único para etiquetar el estado de un
 * registro: recibe la variante de forma explícita, en lugar de deducirla del
 * texto. El `StatusBadge` que vivía en `DataTable.jsx` y la adivinaba por
 * palabras clave se retiró; para estados de dominio abierto la heurística
 * sobrevive en `shared/utils/statusVariant.js`, que devuelve una de estas
 * variantes.
 *
 * No improvisar el color. La equivalencia estado → variante está fijada en
 * `rule-decisions.md`: *pendiente/en espera* → `warning`, *en proceso/en
 * tránsito* → `info`, *exitoso/completado* → `success`, *error/rechazado* →
 * `error`, *desconocido* → `default`.
 *
 * ── `hint`: la píldora que se explica sola ───────────────────────────────────
 * Con `hint` la insignia se envuelve en `Hint`, así que la explicación se abre
 * al pasar el cursor o con Tab + Enter. Sustituye a `WarningTags`, que
 * resolvía lo mismo con `data-tooltip` y pseudo-elementos: aquel tooltip lo
 * recortaba el `overflow` de la tabla y su texto no llegaba a los lectores de
 * pantalla. `Hint` usa portal y `role="tooltip"`, así que no tiene ninguno de
 * los dos problemas.
 *
 * ── Trampas ──────────────────────────────────────────────────────────────────
 * - `icon` es el **componente**, no el elemento: `icon={CheckCircle}`, no
 *   `icon={<CheckCircle />}`. El tamaño lo deriva de `size` (10px o 12px).
 * - **`hint` convierte la insignia en un foco tabulable.** `Hint` pone
 *   `tabIndex={0}` y `role="button"` en su disparador. Dentro de una fila de
 *   `DataTable` con `onRowClick` —que también es `role="button"`— el evento
 *   burbujea: si no se quiere que interactuar con la insignia dispare la fila,
 *   hay que parar la propagación en el contenedor (lo hace la columna de
 *   advertencias de compras internacionales).
 * - **Sin `hint`, el render es idéntico al de siempre.** El retorno temprano
 *   está para eso: los usos existentes no ganan ni un atributo.
 * - `variant="primary"` tiene CSS pero no se usa en ninguna parte del proyecto.
 * - Un `size` fuera de `sm|md` se queda sin regla y cae al padding base.
 *
 * @param {'default'|'success'|'error'|'warning'|'info'|'stuck'|'primary'} variant   - Color semántico. Explícito: no se deduce del texto. `stuck` es un tono propio para "atascado/bloqueado", distinto de `warning`; ningún estado lo usa por defecto todavía (ver `rule-decisions.md`). (default: 'default')
 * @param {'sm'|'md'}        size       - Tamaño. Decide también el del icono. Usar `sm` en tablas densas. (default: 'md')
 * @param {LucideIcon}       [icon]     - Componente de icono, no elemento. Se instancia internamente.
 * @param {React.ReactNode}  [children] - Texto de la etiqueta.
 * @param {string}           className  - Clases extra. (default: '')
 * @param {string}           [hint]     - Explicación en un tooltip. Vacío o ausente: la insignia se dibuja pelada, sin envoltorio ni foco.
 * @param {'top'|'bottom'|'left'|'right'} hintPosition - Lado del tooltip. Por defecto `bottom` y no `top` como `Hint`, porque las insignias viven en celdas de tabla. (default: 'bottom')
 *
 * @example
 * // Estado de un registro
 * <Badge variant="warning">Pendiente</Badge>
 * <Badge variant="success" icon={CheckCircle}>Aprobado</Badge>
 *
 * @example
 * // Con explicación: sustituye al patrón <Hint><Badge/></Hint>
 * <Badge variant="warning" size="sm" icon={AlertTriangle} hint="Falta elegir una cuenta destino para poder pagarla.">
 *   Falta cuenta
 * </Badge>
 *
 * @example
 * // Dentro de una celda de DataTable: tamaño sm
 * {
 *   header: 'Estado',
 *   accessor: 'estado',
 *   cell: (row) => <Badge variant={variantePorEstado(row.estado)} size="sm">{row.estado}</Badge>,
 * }
 */
export function Badge({
  variant = 'default',
  size = 'md',
  icon: Icon,
  children,
  className = '',
  hint,
  hintPosition = 'bottom',
}) {
  const badge = (
    <span className={`badge badge-${variant} badge-${size} ${className}`}>
      {Icon && <Icon size={size === 'sm' ? 10 : 12} aria-hidden="true" />}
      {children}
    </span>
  );

  if (!hint) return badge;

  // `badge-hint` solo neutraliza el `margin-left: 6px` de `.hint-container`,
  // que existe para separar el icono de interrogación del texto de un
  // encabezado. Sin anularlo, cada insignia con tooltip se desplaza 6px y una
  // fila de varias queda con separaciones desiguales.
  return (
    <Hint text={hint} position={hintPosition} className="badge-hint">
      {badge}
    </Hint>
  );
}
