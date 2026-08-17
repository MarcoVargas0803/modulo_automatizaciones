import React from 'react';
import { AlertCircle, CheckCircle, Info, AlertTriangle, X } from 'lucide-react';
import './Alert.css';

/** Icono por variante. Una variante desconocida cae a `info` por el `??` de abajo. */
const ICON_MAP = {
  error:   <AlertCircle size={18} aria-hidden="true" />,
  success: <CheckCircle size={18} aria-hidden="true" />,
  warning: <AlertTriangle size={18} aria-hidden="true" />,
  info:    <Info size={18} aria-hidden="true" />,
};

/** Urgencia de a11y por variante: `alert` interrumpe al lector de pantalla, `status` no. */
const ROLE_MAP = {
  error:   'alert',
  warning: 'alert',
  success: 'status',
  info:    'status',
};

/**
 * Alert — Aviso en bloque para condiciones que persisten en la página.
 *
 * A diferencia del toast (`useToast`), ocupa sitio en el layout y se queda
 * hasta que la página decide quitarlo. Regla de decisión: resultado de una
 * acción → toast; condición que sigue siendo cierta → `Alert`. La tabla
 * completa está en `docs/DESIGN.md §4`.
 *
 * ── Elegir la variante no es solo elegir el color ────────────────────────────
 * La variante decide también la urgencia de accesibilidad:
 * - `error` y `warning` → `role="alert"` + `aria-live="assertive"`: el lector de
 *   pantalla interrumpe lo que esté leyendo.
 * - `success` e `info` → `role="status"` + `aria-live="polite"`.
 *
 * Una variante desconocida cae entera a `info` —clase, icono y `role` a la vez—
 * en lugar de producir una clase sin CSS que dejaba el aviso transparente. Es
 * una red, no un adorno: `SupplierAccounts` y `PaymentsReconciliation` pasan
 * `variant` de forma dinámica desde su estado local.
 *
 * ── Trampas ──────────────────────────────────────────────────────────────────
 * - **Una variante mal escrita no falla, se degrada.** Sale como `info`, sin
 *   aviso en consola: un `variant="danger"` copiado de `Button` se vería azul.
 * - **`onDismiss` solo dibuja el botón.** El `Alert` no se oculta solo: quien
 *   lo monta debe guardar el estado de visibilidad y dejar de renderizarlo.
 *
 * @param {'info'|'success'|'warning'|'error'} variant     - Color, icono y urgencia de a11y. (default: 'info')
 * @param {React.ReactNode}                   [title]      - Título en negrita sobre el contenido.
 * @param {React.ReactNode}                   [children]   - Cuerpo del aviso.
 * @param {() => void}                        [onDismiss]  - Si se pasa, dibuja el botón de cerrar. No oculta nada por sí solo.
 * @param {string}                            className    - Clases extra. (default: '')
 *
 * @example
 * // Condición persistente en la página
 * <Alert variant="warning" title="Revisa antes de continuar">
 *   Hay 3 partidas sin costo asignado.
 * </Alert>
 *
 * @example
 * // Descartable: el estado vive en la página, no en el Alert
 * {avisoVisible && (
 *   <Alert variant="info" title="Proceso programado" onDismiss={() => setAvisoVisible(false)}>
 *     El proceso se ejecuta cada hora.
 *   </Alert>
 * )}
 */
export function Alert({ variant = 'info', title, children, className = '', onDismiss }) {
  // La variante también entra en el nombre de la clase, así que un valor
  // desconocido producía `alert-loQueSea`: sin CSS, el aviso salía transparente.
  // Se resuelve una sola vez para clase, icono y role, en vez de que cada uno
  // caiga por su cuenta.
  const safeVariant = variant in ICON_MAP ? variant : 'info';
  const icon = ICON_MAP[safeVariant];
  const role = ROLE_MAP[safeVariant];

  return (
    <div
      className={`alert alert-${safeVariant} ${className}`}
      role={role}
      aria-live={role === 'alert' ? 'assertive' : 'polite'}
    >
      <span className="alert-icon">{icon}</span>
      <div className="alert-body">
        {title && <p className="alert-title">{title}</p>}
        <div className="alert-content">{children}</div>
      </div>
      {onDismiss && (
        <button
          type="button"
          className="alert-dismiss"
          onClick={onDismiss}
          aria-label="Ocultar aviso"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}
