import React from 'react';
import './Select.css';

/**
 * Select — Dropdown estilizado, consistente con el componente Input.
 *
 * Las opciones se pueden declarar de dos formas, según le acomode a quien lo
 * use: con el array `options`, o pasando las <option> como children — que es lo
 * natural cuando se mapean desde la API o se mezclan con opciones estáticas.
 * Si hay children, `options` se ignora.
 *
 * La resolución es `{children ?? options.map(…)}`: si se pasan las dos cosas,
 * `options` se descarta **en silencio**, sin aviso en consola. Hay que elegir
 * una vía por uso.
 *
 * El error se anuncia con `role="alert"`, pero —a diferencia de `Textarea`— no
 * se enlaza al campo con `aria-describedby`: se lee al aparecer, no al enfocar
 * el `<select>`.
 *
 * El uso canónico para cualquier desplegable nuevo es `Select`, no un `<select>`
 * nativo con estilos propios.
 *
 * @param {string}                            [label]       - Etiqueta visible. Sin ella no se dibuja el `<label>`.
 * @param {string}                            [id]          - ID del `<select>`; vincula la etiqueta con el campo.
 * @param {{value: string, label: string}[]}  options       - Opciones declarativas. Se ignoran si hay `children`. (default: [])
 * @param {string}                            [placeholder] - Añade una `<option value="" disabled>` al principio.
 * @param {string}                            [error]       - Mensaje de error, anunciado con `role="alert"`.
 * @param {React.ReactNode}                   [children]    - Las `<option>` escritas a mano. Tienen prioridad sobre `options`.
 * @param {string}                            className     - Clases extra para el contenedor `.select-group`. (default: '')
 * @param {Object}                            props         - Resto de props nativas del `<select>` (value, onChange, disabled, multiple…).
 *
 * @example
 * // Opciones estáticas: array `options`
 * <Select
 *   label="Sucursal"
 *   id="sucursal"
 *   placeholder="Selecciona una sucursal"
 *   value={sucursal}
 *   onChange={(e) => setSucursal(e.target.value)}
 *   options={[
 *     { value: 'matriz', label: 'Matriz' },
 *     { value: 'norte', label: 'Sucursal Norte' },
 *   ]}
 * />
 *
 * @example
 * // Datos de API mezclados con una opción fija: children (no pasar `options` a la vez)
 * <Select label="Proceso" id="proceso" value={proceso} onChange={handleProceso}>
 *   <option value="ALL">Todos los procesos</option>
 *   {procesos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
 * </Select>
 */
export function Select({ label, id, options = [], placeholder, error, className = '', children, ...props }) {
  return (
    <div className={`select-group ${className}`}>
      {label && (
        <label htmlFor={id} className="select-label label-text">
          {label}
        </label>
      )}
      <select
        id={id}
        className={`select-field ${error ? 'select-field--error' : ''}`}
        {...props}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {children ?? options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && <span className="select-error-msg" role="alert">{error}</span>}
    </div>
  );
}
