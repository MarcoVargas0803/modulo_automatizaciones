import React, { useContext, useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { TreeViewContext } from './tree-view-context';
import './TreeView.css';

const NAV_KEYS = [
  'ArrowDown',
  'ArrowUp',
  'ArrowRight',
  'ArrowLeft',
  'Home',
  'End',
  ' ',
];

/** Nodos navegables, en orden visual. Los hijos colapsados no están en el DOM. */
function visibleItems(container) {
  return Array.from(
    container.querySelectorAll('[role="treeitem"]:not([aria-disabled="true"])'),
  );
}

/** Sube al nodo padre: el treeitem del <li> que contiene al grupo de este nodo. */
function parentItemOf(element) {
  const group = element.closest('ul[role="group"]');
  const parentLi = group?.closest('li');

  return parentLi?.querySelector('[role="treeitem"]') || null;
}

/** Baja al primer hijo: el grupo es el hermano inmediato del propio nodo. */
function firstChildItemOf(element) {
  return element.nextElementSibling?.querySelector('[role="treeitem"]') || null;
}

/**
 * TreeView — Árbol de navegación jerárquico.
 *
 * Compound, como `Tabs`: el árbol se describe anidando `<TreeItem>`, no con un
 * array de datos, para que una hoja pueda llevar cualquier contenido (un badge,
 * un icono distinto) sin inventar una prop nueva en un esquema.
 *
 * Implementa a mano el patrón *Navigation Treeview* de WAI-ARIA, igual que
 * `Tabs.jsx` implementa `role="tablist"`: `role="tree"` sobre el contenedor,
 * `role="treeitem"` en cada nodo, **roving tabindex** (el árbol entero es una
 * sola parada de tabulación) y navegación con flechas.
 *
 * La expansión es **no controlada por defecto**: basta `defaultExpandedIds`.
 * Pasar `expandedIds` la convierte en controlada y entonces el estado vive
 * fuera. `onExpandedChange` se avisa en ambos modos.
 *
 * Los hijos de una rama colapsada **no se renderizan**. De ahí que la consulta
 * al DOM que hace la navegación con flechas devuelva ya solo nodos visibles,
 * sin filtrado extra.
 *
 * @param {React.ReactNode} children           - Elementos `<TreeItem>` de primer nivel.
 * @param {string[]}        defaultExpandedIds - Ramas abiertas al montar (modo no controlado). (default: [])
 * @param {string[]}        expandedIds        - Ramas abiertas. Pasarla activa el modo controlado.
 * @param {(ids: string[]) => void} onExpandedChange - Recibe la lista completa de ramas abiertas.
 * @param {string}          selectedId         - Id del nodo marcado como activo.
 * @param {(id: string) => void} onSelect      - Recibe el **id** del nodo activado, no el evento.
 * @param {'surface'|'sidebar'} variant        - Paleta: contenido claro o barra lateral oscura. (default: 'surface')
 * @param {string}          ariaLabel          - Nombra el árbol para lectores de pantalla.
 * @param {string}          className          - Clases extra para el contenedor. (default: '')
 *
 * @example
 * // Menú de procesos con una rama abierta de inicio
 * <TreeView
 *   ariaLabel="Secciones del portal"
 *   defaultExpandedIds={['revaluaciones']}
 *   selectedId={seccion}
 *   onSelect={setSeccion}
 * >
 *   <TreeItem id="revaluaciones" label="Revaluación" icon={ClipboardCheck}>
 *     <TreeItem id="rev-dashboard" label="Dashboard General" to="/dashboard" />
 *     <TreeItem id="rev-registros" label="Registros" to="/logs" />
 *   </TreeItem>
 * </TreeView>
 */
export function TreeView({
  children,
  defaultExpandedIds = [],
  expandedIds,
  onExpandedChange,
  selectedId,
  onSelect,
  variant = 'surface',
  ariaLabel,
  className = '',
}) {
  const isControlled = expandedIds !== undefined;
  const [internalExpanded, setInternalExpanded] = useState(
    () => new Set(defaultExpandedIds),
  );
  const [focusedId, setFocusedId] = useState(null);

  const expanded = useMemo(
    () => (isControlled ? new Set(expandedIds) : internalExpanded),
    [isControlled, expandedIds, internalExpanded],
  );

  // Sin nada enfocado ni seleccionado, la parada de tabulación es el primer nodo
  // raíz. Se lee de los children en vez de registrar refs, igual que Tabs lee las
  // pestañas del DOM: así un <TreeItem> condicional no descuadra nada.
  const firstRootId = useMemo(() => {
    const first = React.Children.toArray(children).find(
      (child) => React.isValidElement(child) && child.props?.id,
    );

    return first?.props?.id ?? null;
  }, [children]);

  const tabStopId = focusedId ?? selectedId ?? firstRootId;

  const toggle = (id) => {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);

    if (!isControlled) setInternalExpanded(next);
    onExpandedChange?.(Array.from(next));
  };

  const moveTo = (element) => {
    if (!element) return;
    element.focus();
    setFocusedId(element.dataset.treeItemId ?? null);
  };

  const handleKeyDown = (event) => {
    if (!NAV_KEYS.includes(event.key)) return;

    const current = document.activeElement;
    if (current?.getAttribute('role') !== 'treeitem') return;

    // El Espacio no activa un <a> de forma nativa (hace scroll). Se iguala su
    // comportamiento al de un <button> para que las hojas respondan igual.
    if (event.key === ' ') {
      event.preventDefault();
      current.click();
      return;
    }

    const items = visibleItems(event.currentTarget);
    if (items.length === 0) return;

    const index = items.indexOf(current);
    const isBranch = current.hasAttribute('aria-expanded');
    const isExpanded = current.getAttribute('aria-expanded') === 'true';

    if (event.key === 'ArrowRight') {
      if (!isBranch) return;
      event.preventDefault();
      if (isExpanded) moveTo(firstChildItemOf(current));
      else toggle(current.dataset.treeItemId);
      return;
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      if (isBranch && isExpanded) toggle(current.dataset.treeItemId);
      else moveTo(parentItemOf(current));
      return;
    }

    event.preventDefault();
    let next;
    if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = items.length - 1;
    else if (index === -1) next = 0;
    else next = index + (event.key === 'ArrowDown' ? 1 : -1);

    // Sin envolver: en un árbol, bajar desde el último nodo no salta al primero.
    if (next < 0 || next >= items.length) return;
    moveTo(items[next]);
  };

  // Sin useMemo a propósito: los <TreeItem> son children de este componente, así
  // que vuelven a renderizarse con él pase lo que pase. Memorizar el contexto no
  // ahorraría nada y sí arriesgaría dejar `toggle` con un cierre obsoleto.
  const context = { expanded, toggle, selectedId, onSelect, tabStopId, setFocusedId };

  return (
    <TreeViewContext.Provider value={context}>
      <TreeNodeList
        role="tree"
        level={1}
        ariaLabel={ariaLabel}
        className={`tree-view tree-view--${variant} ${className}`}
        onKeyDown={handleKeyDown}
      >
        {children}
      </TreeNodeList>
    </TreeViewContext.Provider>
  );
}

/**
 * Lista de nodos de un mismo nivel.
 *
 * Inyecta nivel y posición con `cloneElement` porque `aria-level`,
 * `aria-posinset` y `aria-setsize` son datos que solo conoce el padre. Las props
 * inyectadas van con prefijo `__` para que se distingan de las públicas.
 */
function TreeNodeList({ children, level, role, ariaLabel, className, onKeyDown }) {
  const items = React.Children.toArray(children).filter(React.isValidElement);

  return (
    <ul
      role={role}
      aria-label={ariaLabel}
      className={className}
      onKeyDown={onKeyDown}
    >
      {items.map((child, index) =>
        React.cloneElement(child, {
          __level: level,
          __posinset: index + 1,
          __setsize: items.length,
        }),
      )}
    </ul>
  );
}

/**
 * TreeItem — Un nodo del árbol. Solo funciona dentro de `<TreeView>`.
 *
 * Tener `children` es lo que convierte al nodo en **rama**: dibuja el chevron,
 * expone `aria-expanded` y responde a →/←. Sin ellos es una **hoja**.
 *
 * Con `to` renderiza un `NavLink`, es decir un `<a>` real: admite clic derecho,
 * «abrir en pestaña nueva» y el estado activo que calcula React Router. Sin `to`
 * renderiza un `<button>`, que es lo correcto para una rama que solo agrupa.
 *
 * Nota de accesibilidad: `role="treeitem"` sobre el `<a>` sustituye su rol
 * nativo de enlace. Es lo que prescribe el ejemplo *Navigation Treeview* de la
 * APG para árboles de navegación, y por eso se marca la hoja activa además con
 * `aria-current="page"`.
 *
 * @param {string}              id       - Identificador del nodo. Lo usan la expansión y la selección.
 * @param {React.ReactNode}     label    - Texto del nodo.
 * @param {React.ComponentType} icon     - Componente de icono Lucide, no elemento. Se pinta a 20px.
 * @param {string}              to       - Ruta. Si está, el nodo es un enlace de React Router.
 * @param {boolean}             end      - Coincidencia exacta de ruta. `false` mantiene el nodo activo en las rutas hijas (p. ej. «Registros» sobre `/logs/:id`). (default: true)
 * @param {React.ReactNode}     badge    - Contador o distintivo alineado a la derecha.
 * @param {boolean}             disabled - Lo excluye del recorrido con flechas y lo apaga. (default: false)
 * @param {React.ReactNode}     children - `<TreeItem>` hijos. Su presencia convierte el nodo en rama.
 * @param {string}              className - Clases extra para el nodo. (default: '')
 */
export function TreeItem({
  id,
  label,
  icon: Icon,
  to,
  end = true,
  badge,
  disabled = false,
  children,
  className = '',
  __level = 1,
  __posinset = 1,
  __setsize = 1,
}) {
  const context = useContext(TreeViewContext);

  if (!context) {
    throw new Error('<TreeItem> debe usarse dentro de <TreeView>');
  }

  const isBranch = React.Children.count(children) > 0;
  const isExpanded = isBranch && context.expanded.has(id);
  const isSelected = context.selectedId === id;

  const handleClick = () => {
    if (disabled) return;
    if (isBranch) context.toggle(id);
    context.onSelect?.(id);
  };

  const nodeProps = {
    role: 'treeitem',
    // Tooltip nativo: el único lugar donde el texto del nodo sigue disponible
    // si `.tree-item__label` se recorta con elipsis (fila muy larga) o se
    // oculta del todo (modo compacto de solo íconos, DashboardLayout.css).
    title: typeof label === 'string' ? label : undefined,
    'data-tree-item-id': id,
    'aria-level': __level,
    'aria-posinset': __posinset,
    'aria-setsize': __setsize,
    'aria-selected': isSelected,
    'aria-disabled': disabled || undefined,
    ...(isBranch ? { 'aria-expanded': isExpanded } : {}),
    // Roving tabindex: solo un nodo del árbol es alcanzable con Tab.
    tabIndex: context.tabStopId === id ? 0 : -1,
    onClick: handleClick,
    onFocus: () => context.setFocusedId(id),
    // La indentación se pasa por variable CSS para que el relleno horizontal y
    // el fondo del hover ocupen la fila completa, no solo el texto sangrado.
    style: { '--tree-item-level': __level },
  };

  const content = (
    <>
      <span className="tree-item__chevron" aria-hidden="true">
        {isBranch && <ChevronRight size={16} />}
      </span>
      {Icon && <Icon size={20} aria-hidden="true" />}
      <span className="tree-item__label">{label}</span>
      {badge != null && <span className="tree-item__badge">{badge}</span>}
    </>
  );

  const nodeClassName = [
    'tree-item',
    isSelected ? 'tree-item--selected' : '',
    isExpanded ? 'tree-item--expanded' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <li role="none">
      {to && !disabled ? (
        <NavLink
          to={to}
          end={end}
          {...nodeProps}
          className={({ isActive }) =>
            `${nodeClassName}${isActive ? ' tree-item--active' : ''}`
          }
          aria-current={isSelected ? 'page' : undefined}
        >
          {content}
        </NavLink>
      ) : (
        <button
          type="button"
          disabled={disabled}
          {...nodeProps}
          className={nodeClassName}
        >
          {content}
        </button>
      )}

      {isBranch && isExpanded && (
        <TreeNodeList role="group" level={__level + 1} className="tree-view__group">
          {children}
        </TreeNodeList>
      )}
    </li>
  );
}
