import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/shared/components/Button/Button';
import './Pagination.css';

/**
 * Pagination — Controles de paginación totalmente controlados.
 *
 * No guarda estado ni navega: recibe la página actual y avisa por callback.
 * Quien decide es la página, normalmente pidiendo el nuevo tramo al backend.
 * `onPageChange` recibe el número **ya calculado y acotado** al rango
 * `[1, totalPages]`, no un delta.
 *
 * Un `pageSize` que no esté en `pageSizeOptions` **se inserta en la lista** en su
 * posición ordenada, en lugar de dejar el `<select>` con un `value` huérfano. Es
 * lo que salva a `Logs` y a `InternationalPurchases`, que aceptan cualquier
 * `?limit=1..100` de la URL pero usan las opciones por defecto `[10, 25, 50]`.
 *
 * ── Trampas ──────────────────────────────────────────────────────────────────
 * - **`hideWhenSingle` es opt-in.** Por defecto sigue ocupando su espacio con
 *   una sola página o con cero resultados, con ambos botones desactivados. El
 *   default es conservador a propósito: ocultarlo entero se llevaría también el
 *   selector de tamaño, dejando al usuario sin forma de ampliar un listado que
 *   cabe en una página. `PaymentsWorkbench` sigue mostrando "Página 1 de 1" bajo
 *   una tabla vacía hasta que adopte la prop.
 * - **Sin `onPageSizeChange` desaparece el selector entero**, no solo se
 *   deshabilita.
 *
 * @param {number}            page              - Página actual, empezando en 1. Un valor menor se trata como 1.
 * @param {number}            totalPages        - Total de páginas. Requerido de facto: sin él el botón "siguiente" queda bloqueado.
 * @param {(page: number) => void} onPageChange - Recibe el número de página ya calculado y acotado.
 * @param {boolean}           [isLoading]       - Deshabilita los botones y el selector mientras se cargan datos.
 * @param {number}            [pageSize]        - Tamaño actual. Si no está en `pageSizeOptions` se añade a la lista.
 * @param {(size: number) => void} [onPageSizeChange] - Recibe el número ya convertido. Sin ella desaparece todo el selector.
 * @param {number[]}          pageSizeOptions   - Opciones del selector. (default: [10, 25, 50])
 * @param {boolean}           hideWhenSingle    - Con `true` no se dibuja nada si `totalPages <= 1`. (default: false)
 *
 * @example
 * // Paginación contra el backend, ocultándola cuando sobra
 * <Pagination
 *   page={page}
 *   totalPages={totalPages}
 *   pageSize={pageSize}
 *   isLoading={isLoading}
 *   hideWhenSingle
 *   onPageChange={setPage}
 *   onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
 * />
 *
 * @example
 * // Con opciones propias
 * <Pagination
 *   page={page}
 *   totalPages={totalPages}
 *   pageSize={25}
 *   pageSizeOptions={[25, 50, 100]}
 *   onPageChange={setPage}
 *   onPageSizeChange={setPageSize}
 * />
 */
export function Pagination({
  page,
  totalPages,
  onPageChange,
  isLoading,
  pageSize,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50],
  hideWhenSingle = false,
}) {
  const lastPage = totalPages || 1;
  const currentPage = Math.max(1, page || 1);

  if (hideWhenSingle && lastPage <= 1) return null;

  // Un pageSize fuera de la lista dejaría al <select> con un value sin <option>
  // que le corresponda: se inserta en su posición en vez de perder la sincronía.
  const sizeOptions = Number.isFinite(pageSize) && !pageSizeOptions.includes(pageSize)
    ? [...pageSizeOptions, pageSize].sort((a, b) => a - b)
    : pageSizeOptions;

  return (
    <div className="pagination-wrapper">
      {onPageSizeChange && (
        <label className="pagination-size">
          Mostrar
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            disabled={isLoading}
            aria-label="Registros por página"
          >
            {sizeOptions.map((size) => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
          por página
        </label>
      )}

      <span>
        Página {currentPage} de {lastPage}
      </span>

      <Button
        variant="secondary"
        onClick={() => onPageChange(Math.max(1, currentPage - 1))}
        disabled={currentPage <= 1 || isLoading}
        aria-label="Página anterior"
      >
        <ChevronLeft size={18} />
      </Button>

      <Button
        variant="secondary"
        onClick={() => onPageChange(Math.min(lastPage, currentPage + 1))}
        disabled={currentPage >= lastPage || isLoading}
        aria-label="Página siguiente"
      >
        <ChevronRight size={18} />
      </Button>
    </div>
  );
}
