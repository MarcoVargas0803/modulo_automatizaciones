import React from 'react';
import './Button.css';

/**
 * Button — Botón base del sistema de diseño.
 *
 * Envuelve un `<button>` nativo, así que acepta cualquier atributo del elemento
 * (`type`, `onClick`, `disabled`, `title`, `form`…) y lo reenvía tal cual.
 *
 * Las variantes se resuelven por clase CSS (`btn-${variant}`), de modo que los
 * valores válidos son los definidos en `Button.css`: añadir una variante nueva
 * significa añadir su regla ahí, no tocar este archivo.
 *
 * Cuidado con `disabled`: el spread `{...props}` se aplica DESPUÉS de
 * `disabled={isLoading || props.disabled}`, así que pasar `disabled={false}`
 * explícitamente reactiva el botón aunque `isLoading` sea `true`. Si necesitas
 * controlar el estado deshabilitado, hazlo con `disabled={isSaving || …}` y no
 * mezclándolo con `isLoading`.
 *
 * @param {'primary'|'secondary'|'ghost'|'danger'|'icon'} variant  - Estilo visual. (default: 'primary')
 * @param {boolean}          isLoading  - Muestra un spinner, sustituye los iconos y deshabilita el botón. (default: false)
 * @param {React.ReactNode}  leftIcon   - Icono (Lucide) antes del texto. Se ignora si `isLoading`.
 * @param {React.ReactNode}  rightIcon  - Icono (Lucide) después del texto. Se ignora si `isLoading`.
 * @param {React.ReactNode}  children   - Contenido del botón. Con `variant="icon"` suele ser solo el icono.
 * @param {string}           className  - Clases extra. (default: '')
 * @param {Object}           props      - Resto de props nativas del elemento `<button>`.
 *
 * @example
 * // Acción principal con icono
 * <Button variant="primary" leftIcon={<Plus size={16} />} onClick={abrirModal}>
 *   Nueva solicitud
 * </Button>
 *
 * @example
 * // Botón de guardado con estado de carga
 * <Button type="submit" isLoading={isSaving}>Guardar</Button>
 *
 * @example
 * // Botón cuadrado de solo icono (necesita aria-label, no hay texto que leer)
 * <Button variant="icon" aria-label="Exportar" onClick={exportar}>
 *   <Download size={18} />
 * </Button>
 */
export function Button({
  variant = 'primary',
  className = '',
  children,
  isLoading = false,
  leftIcon,
  rightIcon,
  ...props
}) {
  return (
    <button
      className={`btn btn-${variant} ${isLoading ? 'btn-loading' : ''} ${className}`}
      disabled={isLoading || props.disabled}
      aria-busy={isLoading ? 'true' : undefined}
      {...props}
    >
      {isLoading ? (
        <>
          <ButtonSpinner />
          {children}
        </>
      ) : (
        <>
          {leftIcon && <span className="btn-icon-left" aria-hidden="true">{leftIcon}</span>}
          {children}
          {rightIcon && <span className="btn-icon-right" aria-hidden="true">{rightIcon}</span>}
        </>
      )}
    </button>
  );
}

/* Spinner inline para el estado de carga */
function ButtonSpinner() {
  return (
    <svg
      className="btn-spinner"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      style={{ animation: 'btn-spin 0.75s linear infinite', flexShrink: 0 }}
    >
      <circle
        cx="8" cy="8" r="6"
        stroke="currentColor"
        strokeOpacity="0.3"
        strokeWidth="2"
      />
      <path
        d="M14 8a6 6 0 0 0-6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <style>{`
        @keyframes btn-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          .btn-spinner { animation: none; }
        }
      `}</style>
    </svg>
  );
}
