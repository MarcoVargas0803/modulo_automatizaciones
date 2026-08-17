import React, { Children, useEffect, useRef, useState } from 'react';
import { Filter, X } from 'lucide-react';
import { Button } from '@/shared/components/Button/Button';
import { FilterSearchBox } from './FilterFields';
import { FilterChips } from './FilterChips';
import './FilterBar.css';

/**
 * Una "píldora" de filtro activo, tal como la consumen `FilterBar` y `FilterChips`.
 *
 * @typedef  {Object} FilterChip
 * @property {string}          key      - Identificador único dentro de la lista (sirve de `key` de React).
 * @property {React.ReactNode} label    - Texto visible. Por convención `"Campo: valor"`.
 * @property {() => void}      onRemove - Quita ese filtro suelto al pulsar la píldora.
 */

/**
 * FilterBar — Barra de filtros en formato tarjeta.
 *
 * Es el patrón de filtros único del proyecto. Nació componentizando el toolbar
 * que `pages/Logs/Logs.jsx` tenía escrito a mano, y sustituyó a la antigua
 * barra de "píldoras" (icono + control en línea) que usaban las páginas de
 * Mantenimiento.
 *
 * Consta de: tarjeta contenedora, caja de búsqueda, botón "Filtrar" con panel
 * desplegable, hueco libre para acciones de página (Exportar, Nuevo…) y fila de
 * chips con los filtros activos. Cada pieza es opcional, de modo que la misma
 * barra sirve para una página que solo busca, para una que filtra en vivo, o
 * para una que trabaja con un borrador y un botón "Aplicar".
 *
 * ── Reparto de responsabilidades ─────────────────────────────────────────────
 * El componente es deliberadamente tonto respecto de los filtros: lo único que
 * posee es si el panel está abierto (y su cierre por click fuera / Escape). Los
 * valores, el borrador y la lógica de aplicar o limpiar siguen viviendo en la
 * página. Si la barra guardara el borrador tendría que conocer la forma de los
 * filtros de cada sección, lo que obligaría a una render-prop.
 *
 * `onOpen` cubre el único punto de acople: resincronizar el borrador de la
 * página con los filtros vigentes cada vez que se abre el panel.
 *
 * ── Los dos modos ────────────────────────────────────────────────────────────
 * - `showDropdown` (por defecto): los children van dentro del panel. Con
 *   `showActions` se confirma con "Aplicar"; sin ellos, el filtrado es en vivo.
 * - `showDropdown={false}`: los children se maquetan en línea dentro de la
 *   tarjeta y filtran en tiempo real. `showActions`, `onApply` y `panelTitle`
 *   se ignoran.
 *
 * El CSS del proyecto es global (no CSS Modules), así que las páginas que
 * quieran ajustar la barra deben importar este componente ANTES de su propia
 * hoja de estilos.
 *
 * ── Búsqueda ─────────────────────────────────────────────────────────────────
 * @param {string}                  searchValue        - Texto de la caja de búsqueda (controlado por la página). (default: '')
 * @param {(value: string) => void} [onSearchChange]   - Recibe el texto ya extraído del evento. **Sin esta prop no se dibuja la búsqueda.**
 * @param {string}                  searchPlaceholder  - Placeholder de la caja. (default: 'Buscar…')
 * @param {string}                  searchAriaLabel    - Etiqueta accesible de la caja. (default: 'Buscar')
 *
 * ── Panel de filtros ─────────────────────────────────────────────────────────
 * @param {React.ReactNode} [children]         - Los campos de filtro (`FilterSelectField`, `FilterDateField`…). Sin children no se dibuja el botón "Filtrar".
 * @param {boolean}         showDropdown       - `true`: los children van en el panel desplegable. `false`: se maquetan en línea en la tarjeta. (default: true)
 * @param {string}          filterLabel        - Texto del botón que abre el panel. (default: 'Filtrar')
 * @param {string}          panelTitle         - Título de la cabecera del panel. (default: 'Filtros')
 * @param {string}          [panelAriaLabel]   - `aria-label` del panel. (default: el valor de `panelTitle`)
 * @param {boolean}         hasActiveFilters   - Dibuja el indicador sobre el botón "Filtrar": la cifra de `chips.length` si hay chips, o un punto si no (ej. filtro solo por texto de búsqueda, sin chip). (default: false)
 * @param {() => void}      [onOpen]           - Se invoca al abrir el panel. Su uso habitual es resincronizar el borrador de la página con los filtros vigentes.
 *
 * ── Acciones del panel ───────────────────────────────────────────────────────
 * @param {boolean}    showActions  - Muestra los botones Limpiar / Aplicar dentro del panel. Se ignora con `showDropdown={false}`. (default: true)
 * @param {() => void} [onApply]    - Confirma los filtros. La barra cierra el panel por su cuenta antes de llamarla. Si no se pasa, el botón no aparece.
 * @param {() => void} [onClear]    - Restablece los filtros. También cierra el panel. Si no se pasa, el botón no aparece.
 * @param {string}     applyLabel   - Texto del botón de confirmar. (default: 'Aplicar')
 * @param {string}     clearLabel   - Texto del botón de limpiar. (default: 'Limpiar')
 *
 * ── Acciones de página y resumen ─────────────────────────────────────────────
 * @param {React.ReactNode} [actions]     - Botones propios de la página (Exportar, Nuevo…), a la derecha del botón "Filtrar".
 * @param {FilterChip[]}    chips         - Filtros activos, resumidos como píldoras bajo la tarjeta. (default: [])
 * @param {() => void}      [onClearAll]  - Añade la píldora "Limpiar todo" al final. Sin esta prop no se muestra.
 * @param {string}          className     - Clases extra del contenedor externo. (default: '')
 *
 * @example
 * // Modo panel con borrador y confirmación (el de pages/Logs/Logs.jsx)
 * <FilterBar
 *   searchValue={search}
 *   onSearchChange={setSearch}
 *   searchPlaceholder="Buscar por folio…"
 *   hasActiveFilters={Boolean(filters.estado)}
 *   onOpen={() => setDraft(filters)}          // resincroniza el borrador al abrir
 *   onApply={() => aplicar(draft)}
 *   onClear={limpiar}
 *   chips={[
 *     filters.estado && { key: 'estado', label: `Estado: ${filters.estado}`, onRemove: () => quitar('estado') },
 *   ].filter(Boolean)}
 *   onClearAll={limpiar}
 *   actions={<Button variant="secondary" leftIcon={<Download size={16} />}>Exportar</Button>}
 * >
 *   <FilterSelectField
 *     label="Estado"
 *     id="estado"
 *     value={draft.estado}
 *     onChange={(value) => setDraft({ ...draft, estado: value })}   // recibe el VALOR, no el evento
 *   >
 *     <option value="">Todos</option>
 *     <option value="PENDIENTE">Pendiente</option>
 *   </FilterSelectField>
 * </FilterBar>
 *
 * @example
 * // Modo en línea: filtrado en vivo, sin panel ni botón "Aplicar"
 * <FilterBar showDropdown={false} searchValue={search} onSearchChange={setSearch}>
 *   <FilterDateField label="Desde" id="desde" value={desde} onChange={setDesde} />
 * </FilterBar>
 */
export function FilterBar({
  searchValue = '',
  onSearchChange,
  searchPlaceholder = 'Buscar…',
  searchAriaLabel = 'Buscar',

  showDropdown = true,
  filterLabel = 'Filtrar',
  panelTitle = 'Filtros',
  panelAriaLabel,
  hasActiveFilters = false,
  onOpen,

  showActions = true,
  onApply,
  onClear,
  applyLabel = 'Aplicar',
  clearLabel = 'Limpiar',

  actions,
  chips = [],
  onClearAll,

  className = '',
  children,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef(null);

  // Guardamos onOpen en un ref para que el efecto dependa SOLO de [isOpen]: si
  // dependiera de la prop, cada render del padre con una arrow function nueva
  // volvería a ejecutarlo y pisaría el borrador que el usuario está editando.
  // Misma técnica que components/Modal/Modal.jsx.
  const onOpenRef = useRef(onOpen);
  useEffect(() => {
    onOpenRef.current = onOpen;
  });

  useEffect(() => {
    if (!isOpen) return undefined;

    onOpenRef.current?.();

    const handlePointer = (event) => {
      if (panelRef.current && !panelRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    const handleKey = (event) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);

    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [isOpen]);

  const hasSearch = typeof onSearchChange === 'function';
  const hasFilters = Children.count(children) > 0;
  const usesPanel = hasFilters && showDropdown;

  const handleApply = () => {
    setIsOpen(false);
    onApply?.();
  };

  const handleClear = () => {
    setIsOpen(false);
    onClear?.();
  };

  return (
    <div className={`filter-bar-wrapper ${className}`.trim()}>
      <div className="filter-bar">
        {hasSearch && (
          <FilterSearchBox
            value={searchValue}
            onChange={onSearchChange}
            placeholder={searchPlaceholder}
            ariaLabel={searchAriaLabel}
          />
        )}

        {hasFilters && !showDropdown && (
          <div className="filter-bar__inline">{children}</div>
        )}

        <div className="filter-bar__actions" ref={panelRef}>
          {usesPanel && (
            <Button
              variant="secondary"
              className="filter-bar__trigger"
              onClick={() => setIsOpen(!isOpen)}
              aria-haspopup="dialog"
              aria-expanded={isOpen}
            >
              <Filter size={16} />
              {filterLabel}
              {hasActiveFilters && (
                chips.length > 0
                  ? <span className="filter-bar__count" aria-hidden="true">{chips.length}</span>
                  : <span className="filter-bar__dot" aria-hidden="true" />
              )}
            </Button>
          )}

          {actions}

          {usesPanel && isOpen && (
            <div
              className="filter-panel"
              role="dialog"
              aria-label={panelAriaLabel || panelTitle}
            >
              <div className="filter-panel__header">
                <h3 className="filter-panel__title">{panelTitle}</h3>
                <button
                  type="button"
                  className="filter-panel__close"
                  onClick={() => setIsOpen(false)}
                  aria-label="Cerrar filtros"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="filter-panel__body">
                {children}

                {showActions && (onClear || onApply) && (
                  <div className="filter-panel__actions">
                    {onClear && (
                      <Button variant="secondary" onClick={handleClear} style={{ flex: 1 }}>
                        {clearLabel}
                      </Button>
                    )}
                    {onApply && (
                      <Button variant="primary" onClick={handleApply} style={{ flex: 1 }}>
                        {applyLabel}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <FilterChips chips={chips} onClearAll={onClearAll} />
    </div>
  );
}
