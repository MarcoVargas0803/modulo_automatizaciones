import React from 'react';
import './Input.css';

/**
 * Input — Campo de texto de una línea.
 *
 * Envuelve un `<input>` nativo con su etiqueta y su mensaje de error, así que
 * acepta cualquier atributo del elemento y lo reenvía tal cual: el `type` decide
 * si es texto, fecha, número o búsqueda. No hay componentes separados para eso.
 *
 * Sigue el mismo patrón de accesibilidad que `Textarea`: el mensaje de error
 * lleva `role="alert"` y se enlaza al campo con `aria-describedby`, así que un
 * lector de pantalla lo anuncia al aparecer y lo asocia al campo al enfocarlo.
 *
 * ── Trampas ──────────────────────────────────────────────────────────────────
 * - **`id` es obligatorio en la práctica.** El id del error se deriva de él
 *   (`${id}-error`); sin `id` queda como `undefined-error` y el enlace con el
 *   campo se rompe sin avisar. Misma trampa que en `Textarea`.
 * - **`className` se aplica al contenedor `.input-group`, no al `<input>`.**
 *   Es justo lo que aprovecha `FilterDateField` para maquetar el campo dentro
 *   de la barra de filtros.
 *
 * @param {string}  [label]     - Etiqueta visible. Sin ella no se dibuja el `<label>`.
 * @param {string}  id          - ID del `<input>`. Vincula la etiqueta con el campo y genera el id del error. Requerido en la práctica.
 * @param {string}  [error]     - Mensaje de error, anunciado con `role="alert"`. Pinta el borde rojo y el texto bajo el campo.
 * @param {string}  className   - Clases extra para el contenedor `.input-group`. (default: '')
 * @param {Object}  props       - Resto de props nativas del `<input>` (type, value, onChange, placeholder, disabled…).
 *
 * @example
 * // Básico, controlado
 * <Input
 *   label="Folio"
 *   id="folio"
 *   placeholder="Ej. SOL-2026-0042"
 *   value={folio}
 *   onChange={(e) => setFolio(e.target.value)}
 * />
 *
 * @example
 * // Otros tipos: los da el atributo nativo, no una prop del componente
 * <Input label="Fecha desde" id="fecha-desde" type="date" value={desde} onChange={handleDesde} />
 * <Input label="Cantidad" id="cantidad" type="number" min="0" value={qty} onChange={handleQty} />
 *
 * @example
 * // Con error de validación
 * <Input label="Correo" id="correo" value={correo} onChange={handleCorreo} error="Formato de correo no válido." />
 */
export function Input({ label, id, className = '', error, ...props }) {
  return (
    <div className={`input-group ${className}`}>
      {label && (
        <label htmlFor={id} className="input-label label-text">
          {label}
        </label>
      )}
      <input
        id={id}
        className={`input-field ${error ? 'input-error' : ''}`}
        aria-describedby={error ? `${id}-error` : undefined}
        {...props}
      />
      {error && (
        <span id={`${id}-error`} className="input-error-msg" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
