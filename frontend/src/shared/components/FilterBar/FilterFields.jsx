import React from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/shared/components/Input/Input';
import { Select } from '@/shared/components/Select/Select';
// Los campos usan las clases .filter-bar__* (posición del icono de búsqueda, ancho
// mínimo de los campos). Antes solo se cargaban si la página también montaba
// <FilterBar>; al usarse sueltos (p. ej. el buscador del workbench sin la barra),
// hay que importar su hoja aquí para que sean autosuficientes.
import './FilterBar.css';

/**
 * Campos que alimentan a FilterBar.
 *
 * Los tres reusan los componentes base del sistema de diseño (Input, Select)
 * en lugar de reimplementar sus estilos: antes `Logs.css` duplicaba en
 * `.filter-field__select` casi exactamente lo que ya hacía `.select-field`.
 *
 * Todos exponen `onChange` recibiendo el VALOR, no el evento — misma convención
 * que el FilterBar de píldoras, para que migrar una página no obligue a tocar
 * los handlers.
 */

/**
 * FilterSearchBox — Caja de búsqueda del toolbar: input con el icono de lupa
 * superpuesto a la izquierda y un botón para limpiar cuando hay texto.
 *
 * No hace debounce a propósito: quien decide cada cuánto se dispara la búsqueda
 * es la página (Logs, por ejemplo, la sincroniza contra la URL a los 250 ms).
 *
 * @param {string}                  value        - Texto actual (controlado por la página). (default: '')
 * @param {(value: string) => void} onChange     - Recibe el texto ya extraído del evento. También se llama con `''` al pulsar la X.
 * @param {string}                  [placeholder]
 * @param {string}                  ariaLabel    - Etiqueta accesible del input. (default: 'Buscar')
 *
 * @example
 * <FilterSearchBox value={search} onChange={setSearch} placeholder="Buscar por folio…" />
 */
export function FilterSearchBox({ value = '', onChange, placeholder, ariaLabel = 'Buscar' }) {
  return (
    <div className="filter-bar__search">
      <Input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel}
      />
      <Search size={18} className="filter-bar__search-icon" aria-hidden="true" />
      {value && (
        <button
          type="button"
          className="filter-bar__search-clear"
          onClick={() => onChange('')}
          aria-label="Limpiar búsqueda"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}

/**
 * FilterSelectField — Etiqueta + <select>, apilados.
 *
 * Las opciones se pueden pasar de dos formas, según le acomode a la página:
 * como children (`<option>` sueltas o mapeadas desde la API) o como el array
 * `options` que ya aceptaba Select.
 *
 * @param {string}                  label      - Etiqueta visible.
 * @param {string}                  id         - Vincula la etiqueta con el control. Debe ser único en la página.
 * @param {string}                  value      - Opción seleccionada.
 * @param {(value: string) => void} onChange   - Recibe el valor, **no** el evento.
 * @param {{value: string, label: string}[]} [options]  - Opciones en forma de array.
 * @param {React.ReactNode}         [children] - Las `<option>` sueltas; tiene prioridad sobre `options`.
 * @param {Object}                  props      - Resto de props, que llegan a `Select`.
 *
 * @example
 * // Opciones como children
 * <FilterSelectField label="Estado" id="estado" value={estado} onChange={setEstado}>
 *   <option value="">Todos</option>
 *   <option value="PENDIENTE">Pendiente</option>
 * </FilterSelectField>
 *
 * @example
 * // Opciones como array (útil cuando vienen de la API)
 * <FilterSelectField
 *   label="Sucursal"
 *   id="sucursal"
 *   value={sucursal}
 *   onChange={setSucursal}
 *   options={sucursales.map((s) => ({ value: s.id, label: s.nombre }))}
 * />
 */
export function FilterSelectField({ label, id, value, onChange, options, children, ...props }) {
  return (
    <Select
      className="filter-bar__field"
      label={label}
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      options={options}
      {...props}
    >
      {children}
    </Select>
  );
}

/**
 * FilterDateField — Etiqueta + <input type="date">, apilados.
 *
 * Sin botón propio de limpiar: en este toolbar los filtros se quitan desde los
 * chips o desde el botón "Limpiar" del panel, y una X superpuesta chocaría con
 * el icono nativo del selector de calendario que el navegador dibuja a la
 * derecha del campo.
 *
 * @param {string}                  label     - Etiqueta visible.
 * @param {string}                  id        - Vincula la etiqueta con el control.
 * @param {string}                  value     - Fecha en formato `YYYY-MM-DD`. Cadena vacía = sin fecha.
 * @param {(value: string) => void} onChange  - Recibe la fecha como cadena, **no** el evento.
 * @param {Object}                  props     - Resto de props, que llegan a `Input` (p. ej. `min`, `max`).
 *
 * @example
 * <FilterDateField label="Desde" id="desde" value={desde} onChange={setDesde} max={hasta} />
 */
export function FilterDateField({ label, id, value, onChange, ...props }) {
  return (
    <Input
      className="filter-bar__field filter-bar__field--date"
      label={label}
      id={id}
      type="date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      {...props}
    />
  );
}
