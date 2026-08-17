import React from 'react';
import { Alert } from '@/shared/components/Alert/Alert';
import { Button } from '@/shared/components/Button/Button';

/**
 * ErrorBoundary — Red de seguridad ante un error de render.
 *
 * Es el **único componente de clase del proyecto**, porque React solo permite
 * capturar errores así. Cuando algo revienta al dibujar, sustituye el árbol por
 * un `Alert` de error con el mensaje y un botón de recarga.
 *
 * ── Qué captura y qué no ─────────────────────────────────────────────────────
 * Captura errores lanzados **durante el render** de sus descendientes. Como todo
 * boundary de React, **no** captura: errores dentro de manejadores de eventos
 * (un `onClick` que lanza), código asíncrono (`setTimeout`, promesas, un `catch`
 * que falta en un `fetch`), errores del propio boundary, ni el render en
 * servidor. Para el fallo de una petición, la vía sigue siendo `try/catch` con
 * `toast.error` o un `EmptyState` con acción.
 *
 * ── Cómo se resetea: con `key`, no consigo mismo ─────────────────────────────
 * No sabe volver al estado sano por su cuenta; su botón hace
 * `window.location.reload()`, que recarga el navegador entero y pierde todo el
 * estado. El reset real es externo: `RouteBoundary` en `App.jsx` le pasa
 * `key={pathname}`, así que al navegar a otra sección React lo desmonta y lo
 * vuelve a montar limpio. **Ese truco solo sirve donde el pathname cambia**: en
 * una ruta de path fijo la `key` sería constante y no habría remontaje, así que
 * ponerla ahí no aportaría nada.
 *
 * ── Las tres instancias, y qué cubre cada una ────────────────────────────────
 * | Dónde                        | `key`         | Recuperación                |
 * |------------------------------|---------------|-----------------------------|
 * | Raíz, envolviendo el Router  | no puede      | solo el botón de recarga    |
 * | `RouteBoundary` (por ruta)   | `pathname`    | al navegar a otra sección   |
 * | `/pagos/revision`            | no aplica     | el botón; el token va en el fragmento de la URL y `reload()` lo conserva |
 *
 * El de raíz va **por fuera del Router y de los providers** a propósito: su
 * fallback solo usa `Alert` y `Button`, no necesita context ni `<Link>`, y así
 * cubre lo que antes quedaba sin red — `Login`, la ruta `*`, `ProtectedRoute`,
 * `DashboardLayout` y los propios providers.
 *
 * ── Trampas ──────────────────────────────────────────────────────────────────
 * - **El boundary raíz no se resetea nunca.** Fuera del Router no hay `pathname`
 *   del que derivar una `key`, así que una vez saltado la única salida es
 *   recargar. Es deliberado: es la red de último recurso, no la de uso diario.
 * - **Solo reporta a `console.error`.** No hay envío a ningún servicio: un error
 *   en producción no deja rastro más allá de la consola del usuario.
 *
 * @param {React.ReactNode} children - Árbol vigilado. Es la única prop que acepta.
 *
 * @example
 * // Por ruta, con reset por navegación: el key es lo que lo hace recuperable
 * <ErrorBoundary key={pathname}>
 *   <Outlet />
 * </ErrorBoundary>
 *
 * @example
 * // Raíz, en App.jsx: sin key, por fuera del Router
 * <ErrorBoundary>
 *   <BrowserRouter>…</BrowserRouter>
 * </ErrorBoundary>
 */
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Error no controlado en la interfaz:', error, info?.componentStack);
  }

  render() {
    const { error } = this.state;

    if (!error) {
      return this.props.children;
    }

    return (
      <div style={{ padding: '2rem', maxWidth: '42rem', margin: '0 auto' }}>
        <Alert variant="error" title="La pantalla no se pudo mostrar">
          <p style={{ marginBottom: '0.75rem' }}>
            Ocurrió un error inesperado al dibujar esta sección. La información ya
            guardada no se ve afectada.
          </p>
          {/* El mensaje real suele venir en ingles y en jerga de React: se
            * guarda plegado para no ponerselo delante a quien no lo puede usar,
            * pero sin esconderlo de quien reporta la incidencia. */}
          <details style={{ marginBottom: '1rem' }}>
            <summary
              style={{
                cursor: 'pointer',
                fontFamily: 'var(--font-label)',
                fontSize: '0.8125rem',
                color: 'var(--color-on-surface-variant)',
              }}
            >
              Detalle técnico
            </summary>
            <p
              style={{
                marginTop: '0.5rem',
                marginBottom: 0,
                fontFamily: 'var(--font-mono)',
                fontSize: '0.8125rem',
                color: 'var(--color-on-surface-variant)',
                wordBreak: 'break-word',
              }}
            >
              {error.message}
            </p>
          </details>
          <Button variant="secondary" onClick={() => window.location.reload()}>
            Recargar la página
          </Button>
        </Alert>
      </div>
    );
  }
}
