import React, { useCallback, useMemo, useState } from 'react';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';
import { ToastContext } from './toast-context';
import './Toast.css';

let idCounter = 0;

/** Icono por tipo. Cualquier tipo no reconocido —incluido `warning`— cae al icono de info. */
function iconFor(type) {
  if (type === 'success') return <CheckCircle size={18} />;
  if (type === 'error') return <AlertCircle size={18} />;
  return <Info size={18} />;
}

/**
 * ToastProvider — Proveedor de las notificaciones efímeras. **No hay un componente `<Toast />`.**
 *
 * Ya está montado en `App.jsx` sobre todas las rutas: no hace falta volver a
 * montarlo. Para lanzar un toast se pide el objeto con `useToast()` y se llaman
 * sus métodos. Los toasts se pintan dentro del provider, en una capa fija con
 * `--z-toast`; al contrario que `Hint`, no usa portal.
 *
 * Un toast es para el **resultado de una acción**. Si la condición persiste en
 * la pantalla, el componente correcto es `Alert` (ver `docs/DESIGN.md §4`).
 *
 * ── API que entrega por contexto ─────────────────────────────────────────────
 * - `toast.success(mensaje, opciones)` → `number` — 5000 ms. Devuelve el id.
 * - `toast.error(mensaje, opciones)`   → `number` — **3000 ms**.
 * - `toast.info(mensaje, opciones)`    → `number` — 5000 ms.
 * - `toast.notify(mensaje, opciones)`  → `number` — vía cruda, `type: 'info'` por defecto.
 * - `toast.dismiss(id)`                → `void`   — cierra uno concreto con su animación.
 *
 * Opciones: `{ duration = 5000, action = null, type = 'info' }`. `duration: 0`
 * desactiva el cierre automático. `action` es `{ label, onClick }` y se pinta
 * como botón dentro del toast: al pulsarlo ejecuta `onClick` y cierra.
 *
 * ── Trampas ──────────────────────────────────────────────────────────────────
 * - **Los errores duran menos que los éxitos.** `toast.error` fuerza
 *   `duration: 3000` frente a los 5000 del resto: el mensaje más importante es
 *   el que menos tiempo se ve. Para un error que el usuario debe leer y sobre el
 *   que puede actuar, pasar `{ duration: 0 }`.
 * - **No hay tipo `warning`.** `notify` acepta cualquier `type` sin validarlo,
 *   pero el CSS solo define `success`, `error` e `info`; un `type: 'warning'`
 *   sale gris y con icono de información. Si hace falta advertir, va por `Alert`.
 *
 * @param {React.ReactNode} children - Árbol que tendrá acceso a `useToast()`.
 *
 * @example
 * // Montaje (ya hecho en App.jsx, no repetir)
 * <ToastProvider>
 *   <App />
 * </ToastProvider>
 *
 * @example
 * // Uso desde una página
 * const toast = useToast();
 * toast.success('Solicitud guardada correctamente.');
 *
 * @example
 * // Error accionable: persistente y con botón
 * toast.error('Falló la exportación. Revisa el detalle.', {
 *   duration: 0,
 *   action: { label: 'Reintentar', onClick: exportar },
 * });
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((current) => {
      const target = current.find((t) => t.id === id);
      if (!target || target.dismissing) return current;

      setTimeout(() => {
        setToasts((prev) => prev.filter((toast) => toast.id !== id));
      }, 200);

      return current.map((toast) =>
        toast.id === id ? { ...toast, dismissing: true } : toast
      );
    });
  }, []);

  const notify = useCallback(
    (message, { type = 'info', duration = 5000, action = null } = {}) => {
      const id = ++idCounter;

      setToasts((current) => [...current, { id, message, type, action }]);

      if (duration > 0) {
        window.setTimeout(() => dismiss(id), duration);
      }

      return id;
    },
    [dismiss],
  );

  const value = useMemo(
    () => ({
      notify,
      success: (message, options) => notify(message, { ...options, type: 'success' }),
      error: (message, options) => notify(message, { duration: 3000, ...options, type: 'error' }),
      info: (message, options) => notify(message, { ...options, type: 'info' }),
      dismiss,
    }),
    [notify, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="toast-container"
        role="region"
        aria-live="polite"
        aria-label="Notificaciones"
      >
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast--${toast.type} ${toast.dismissing ? 'toast--dismissing' : ''}`} role="status">
            <span className="toast__icon">{iconFor(toast.type)}</span>
            <span className="toast__message">{toast.message}</span>
            {toast.action && (
              <button
                type="button"
                className="toast__action"
                onClick={() => {
                  toast.action.onClick();
                  dismiss(toast.id);
                }}
              >
                {toast.action.label}
              </button>
            )}
            <button
              type="button"
              className="toast__close"
              onClick={() => dismiss(toast.id)}
              aria-label="Cerrar notificacion"
            >
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
