import React from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { Skeleton } from '@/shared/components/Skeleton/Skeleton';
import './DataTable.css';

/**
 * Descriptor de una columna de `DataTable`.
 *
 * Una columna saca su valor de `accessor` (lectura directa de la fila) o de
 * `cell` (render a medida). Si defines `cell`, `accessor` deja de usarse para
 * pintar, pero sigue haciendo falta como clave de ordenamiento salvo que
 * indiques `sortKey`.
 *
 * @typedef  {Object} DataTableColumn
 * @property {React.ReactNode}                 header       - Encabezado. Acepta JSX (p. ej. texto + `<Hint>`).
 * @property {string}                          [accessor]   - Propiedad de la fila a mostrar, y clave de orden por defecto.
 * @property {(row: Object) => React.ReactNode} [cell]      - Render a medida de la celda. Tiene prioridad sobre `accessor`.
 * @property {boolean}                         [sortable]   - Habilita el botón de ordenar en el encabezado.
 * @property {string}                          [sortKey]    - Clave que se envía a `onSort`. Úsala cuando la columna ordena por un campo distinto del que muestra.
 * @property {string}                          [sortLabel]  - Texto legible para el `aria-label` ("Ordenar por …"). Sin él se usa la clave cruda.
 */

/**
 * DataTable — Tabla de datos del proyecto.
 *
 * Es un componente controlado y sin estado: no ordena, no pagina y no filtra.
 * Solo pinta lo que recibe y avisa por callbacks. El ordenamiento real lo
 * resuelve la página (normalmente contra el backend), que devuelve los datos ya
 * ordenados y le dice a la tabla qué flecha dibujar vía `sortBy`/`sortDir`.
 *
 * Cubre por su cuenta dos estados: `isLoading` pinta la **misma tabla** con un
 * `Skeleton` por celda, y la lista vacía pinta `emptyMessage` en una fila que
 * ocupa todo el ancho. Para un vacío más elaborado —con icono y botón de
 * acción— usa `EmptyState` en la página y no rendericen la tabla.
 *
 * ── Por qué el estado de carga es la tabla real ──────────────────────────────
 * Antes delegaba en un `TableSkeleton` que redibujaba a mano, en estilos en
 * línea, el CSS de este componente. Había divergido: sin `overflow-x`, sin el
 * `fade-in` del contenedor y con las columnas repartidas a partes iguales
 * (`1fr`) en vez de dimensionadas por contenido — por eso al cargar **saltaban
 * todas las columnas de sitio**. Ahora la rama de carga emite el mismo markup y
 * las mismas clases, así que hereda padding, bordes, rayado, `nowrap` y tema
 * oscuro de `DataTable.css` y no puede volver a desincronizarse. Como efecto
 * secundario, la cabecera muestra los títulos reales en lugar de barras grises.
 *
 * La paginación es un componente aparte: `Pagination`.
 *
 * ── Selección múltiple (opcional) ─────────────────────────────────────────────
 * Con `selectable`, la tabla antepone una columna de checkbox (cabecera:
 * todo/nada; fila: individual). Es controlada, igual que el ordenamiento: la
 * tabla no guarda su propia selección, solo la refleja y avisa. `getRowId`
 * decide qué identifica a una fila (por defecto `row.id`); pásalo si tus filas
 * no tienen `id` (p. ej. usan `folio` o `execution_id`).
 *
 * ── Filas de grupo (opcional) ─────────────────────────────────────────────────
 * `isGroupRow`/`renderGroupRow` permiten intercalar encabezados de grupo (con
 * subtotal, por ejemplo) dentro de `data`: la página arma el array ya
 * aplanado (fila de grupo + sus filas), y la tabla solo decide, fila por fila,
 * si es un grupo (ocupa todo el ancho, sin checkbox ni celdas normales) o un
 * registro. Sin estas props, el comportamiento es idéntico al de antes.
 *
 * @param {DataTableColumn[]}  columns       - Definición de columnas. Requerido.
 * @param {Object[]}           data          - Filas a pintar. Un valor no-array se trata como lista vacía.
 * @param {boolean}            isLoading     - Pinta la tabla con celdas de carga en vez de datos. (default: false)
 * @param {number}             skeletonRows  - Filas de relleno mientras `isLoading`. (default: 6)
 * @param {string}             emptyMessage  - Texto de la fila cuando no hay datos. (default: 'No hay registros para mostrar.')
 * @param {(row: Object) => void}   [onRowClick]    - Si se pasa, las filas se vuelven interactivas: cursor, `role="button"`, foco por teclado y activación con Enter o Espacio.
 * @param {(row: Object) => string} [rowClassName]  - Devuelve clases extra por fila (para resaltar estados).
 * @param {string}             [sortBy]      - Clave ordenada actualmente. Debe coincidir con `sortKey` o `accessor` de la columna.
 * @param {'asc'|'desc'}       [sortDir]     - Dirección actual; decide si la flecha apunta arriba o abajo.
 * @param {(key: string) => void} [onSort]   - Se dispara al pulsar un encabezado ordenable. Sin esta prop, `sortable` no tiene efecto.
 * @param {boolean}            [stickyHeader]  - Ancla `<thead>` con `position: sticky` en vez de desplazarse con el contenido. (default: false)
 * @param {string}             [tableCaption]  - Texto de `<caption>` (visualmente oculto) para lectores de pantalla. Sin él, la tabla no lleva `<caption>`.
 * @param {boolean}            [selectable]        - Activa la columna de checkboxes. (default: false)
 * @param {Set}                [selectedIds]       - IDs seleccionados actualmente (según `getRowId`). (default: Set vacío)
 * @param {(next: Set) => void} [onSelectionChange] - Recibe el `Set` completo tras marcar/desmarcar una fila o "todo".
 * @param {(row: Object, index: number) => string|number} [getRowId] - Deriva el id de una fila. (default: `row.id ?? index`)
 * @param {(row: Object) => boolean}        [isGroupRow]     - Distingue una fila de encabezado de grupo de un registro normal.
 * @param {(row: Object) => React.ReactNode} [renderGroupRow] - Contenido de la fila de grupo (ocupa todas las columnas).
 * @param {'comfortable'|'compact'} [density] - Alto de fila. `compact` reduce el padding vertical de las celdas. (default: 'comfortable')
 * @param {string}             className     - Clases extra del contenedor. (default: '')
 *
 * @example
 * const columns = [
 *   { header: 'Folio',  accessor: 'folio', sortable: true, sortLabel: 'folio' },
 *   { header: 'Estado', accessor: 'status', cell: (row) => <Badge variant="info">{row.status}</Badge> },
 *   { header: 'Fecha',  accessor: 'created_at', sortable: true, sortKey: 'fecha', cell: (row) => formatDate(row.created_at) },
 * ];
 *
 * <DataTable
 *   columns={columns}
 *   data={registros}
 *   isLoading={isLoading}
 *   sortBy={sortBy}
 *   sortDir={sortDir}
 *   onSort={handleSort}
 *   onRowClick={(row) => navigate(`/logs/${row.id}`)}
 * />
 *
 * @example
 * // Selección múltiple + fila de grupo con subtotal
 * <DataTable
 *   columns={columns}
 *   data={flattenedGroupsAndRows}
 *   stickyHeader
 *   selectable
 *   selectedIds={selectedIds}
 *   onSelectionChange={setSelectedIds}
 *   isGroupRow={(row) => row.__group}
 *   renderGroupRow={(row) => `${row.label} — ${row.count} · ${formatMoney(row.subtotal)}`}
 * />
 */
export function DataTable({
  columns,
  data,
  className = '',
  emptyMessage = 'No hay registros para mostrar.',
  isLoading = false,
  skeletonRows = 6,
  onRowClick,
  rowClassName,
  sortBy,
  sortDir,
  onSort,
  stickyHeader = false,
  tableCaption,
  selectable = false,
  selectedIds,
  onSelectionChange,
  getRowId = (row, index) => row?.id ?? index,
  isGroupRow,
  renderGroupRow,
  density = 'comfortable',
}) {
  const cols = Array.isArray(columns) ? columns : [];
  const rows = Array.isArray(data) ? data : [];
  const selection = selectedIds instanceof Set ? selectedIds : new Set();

  // Las filas de grupo no se seleccionan: solo cuentan los registros reales
  // para decidir si el checkbox de cabecera va marcado, vacío o "indeterminado".
  const selectableRows = rows.filter((row) => !isGroupRow || !isGroupRow(row));
  const selectableIds = selectableRows.map((row, index) => getRowId(row, index));
  const allSelected = selectable && selectableIds.length > 0
    && selectableIds.every((id) => selection.has(id));
  const someSelected = selectable && !allSelected && selectableIds.some((id) => selection.has(id));
  const headerCheckboxRef = React.useRef(null);

  React.useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = someSelected;
    }
  }, [someSelected]);

  const toggleAll = () => {
    if (!onSelectionChange) return;
    onSelectionChange(allSelected ? new Set() : new Set(selectableIds));
  };

  const toggleRow = (id) => {
    if (!onSelectionChange) return;
    const next = new Set(selection);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectionChange(next);
  };

  const theadClassName = `data-table-thead ${stickyHeader ? 'is-sticky' : ''}`.trim();

  if (isLoading) {
    return (
      <div
        className={`data-table-container ${className}`}
        role="status"
        aria-label="Cargando tabla"
        aria-busy="true"
        data-density={density}
      >
        <table className="data-table">
          {tableCaption && <caption className="sr-only">{tableCaption}</caption>}
          <thead className={theadClassName}>
            <tr>
              {selectable && <th className="data-table-th data-table-th--select" />}
              {cols.map((col, index) => (
                <th key={index} scope="col" className="data-table-th">{col.header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: skeletonRows }).map((_, rowIndex) => (
              <tr key={rowIndex} className="data-table-row">
                {selectable && <td className="data-table-td"><Skeleton width={16} height={16} /></td>}
                {cols.map((__, colIndex) => (
                  // Sin `height`: el bloque hereda el font-size de .data-table-td,
                  // que es justo el alto del texto al que va a dar paso.
                  <td key={colIndex} className="data-table-td"><Skeleton /></td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className={`data-table-container ${className}`} data-density={density}>
      <table className="data-table">
        {tableCaption && <caption className="sr-only">{tableCaption}</caption>}
        <thead className={theadClassName}>
          <tr>
            {selectable && (
              <th className="data-table-th data-table-th--select">
                <input
                  ref={headerCheckboxRef}
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  aria-label={allSelected ? 'Quitar selección de todas las filas' : 'Seleccionar todas las filas'}
                  disabled={selectableIds.length === 0}
                />
              </th>
            )}
            {cols.map((col, index) => {
              const key = col.sortKey || col.accessor;
              const isSortable = col.sortable && onSort && key;

              if (!isSortable) {
                return (
                  <th key={index} scope="col" className="data-table-th">
                    {col.header}
                  </th>
                );
              }

              const isActive = sortBy === key;

              return (
                <th key={index} scope="col" className="data-table-th">
                  <button
                    type="button"
                    className={`data-table-sort ${isActive ? 'is-active' : ''}`}
                    onClick={() => onSort(key)}
                    aria-label={`Ordenar por ${col.sortLabel || key}`}
                  >
                    {col.header}
                    {isActive
                      ? (sortDir === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />)
                      : <ChevronsUpDown size={14} className="data-table-sort-idle" />}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr className="data-table-row">
              <td
                className="data-table-td data-table-empty"
                colSpan={cols.length + (selectable ? 1 : 0)}
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row, rowIndex) => {
              if (isGroupRow && isGroupRow(row)) {
                return (
                  <tr key={`group-${rowIndex}`} className="data-table-row data-table-row--group">
                    <td
                      className="data-table-td data-table-group-cell"
                      colSpan={cols.length + (selectable ? 1 : 0)}
                    >
                      {renderGroupRow ? renderGroupRow(row) : null}
                    </td>
                  </tr>
                );
              }

              const rowId = getRowId(row, rowIndex);
              const isSelected = selectable && selection.has(rowId);

              return (
                <tr
                  key={rowIndex}
                  className={`data-table-row ${onRowClick ? 'data-table-row--clickable' : ''} ${isSelected ? 'is-selected' : ''} ${typeof rowClassName === 'function' ? rowClassName(row) : ''}`.trim()}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  onKeyDown={onRowClick ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onRowClick(row);
                    }
                  } : undefined}
                  role={onRowClick ? 'button' : undefined}
                >
                  {selectable && (
                    <td className="data-table-td data-table-td--select" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleRow(rowId)}
                        aria-label="Seleccionar fila"
                      />
                    </td>
                  )}
                  {cols.map((col, colIndex) => (
                    <td key={colIndex} className="data-table-td">
                      {col.cell ? col.cell(row) : row[col.accessor]}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
