import React from 'react';
import { X } from 'lucide-react';

/**
 * FilterChips — Fila de "píldoras" que resume los filtros activos, cada una
 * con su propia X para quitar ese filtro suelto, más un "Limpiar todo".
 *
 * Es la forma de deshacer filtros en este toolbar: por eso ni el panel ni el
 * campo de fecha llevan botones de limpiar individuales.
 *
 * Normalmente se renderiza desde FilterBar, pero se exporta por separado
 * para páginas que quieran mostrar el resumen en otra parte de la pantalla.
 *
 * Si `chips` llega vacío devuelve `null`, así que la página puede montarlo sin
 * condicionar nada: la fila desaparece sola cuando no hay filtros activos.
 *
 * @param {import('./FilterBar').FilterChip[]} chips - Filtros activos. (default: [])
 * @param {() => void} [onClearAll]    - Añade el chip final que limpia todo. Si no se pasa, ese chip no se muestra.
 * @param {string}     clearAllLabel   - Texto de ese chip final. (default: 'Limpiar todo')
 *
 * @example
 * <FilterChips
 *   chips={[{ key: 'estado', label: 'Estado: Pendiente', onRemove: () => quitar('estado') }]}
 *   onClearAll={limpiarTodo}
 * />
 */
export function FilterChips({ chips = [], onClearAll, clearAllLabel = 'Limpiar todo' }) {
  if (chips.length === 0) return null;

  return (
    <div className="filter-chips">
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          className="filter-chip"
          onClick={chip.onRemove}
        >
          {chip.label}
          <X size={13} aria-hidden="true" />
        </button>
      ))}

      {onClearAll && (
        <button
          type="button"
          className="filter-chip filter-chip--clear"
          onClick={onClearAll}
        >
          {clearAllLabel}
        </button>
      )}
    </div>
  );
}
