import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/shared/context/useAuth';

/**
 * ProtectedRoute — Ruta de layout que exige sesión activa.
 *
 * Sin props: todo su comportamiento está fijo. Mientras valida muestra un texto
 * de espera, si no hay sesión redirige al login, y si la hay pinta el `<Outlet />`.
 *
 * Nunca se instancia dentro de una página. Se declara una sola vez en `App.jsx`
 * y todas las rutas que cuelgan de ella quedan protegidas; ya cubre las 17 rutas
 * internas, así que **una ruta nueva declarada ahí dentro no necesita nada más**
 * para exigir sesión.
 *
 * ── ATENCIÓN: solo comprueba la sesión, nunca el proceso ─────────────────────
 * Estar dentro de `ProtectedRoute` significa "hay alguien con sesión", **no**
 * "esta persona puede ver este módulo". El control de acceso por proceso
 * (`audit_portal.user_process_access`) es responsabilidad de cada página o de un
 * guard propio. Hoy 12 de las 17 rutas protegidas no lo comprueban.
 *
 * ── Conserva el destino al redirigir ─────────────────────────────────────────
 * Al mandar al login pasa `state={{ from: location }}`, y `Login` lo lee para
 * devolver al usuario donde estaba en vez de al aterrizaje por proceso. **Son
 * dos piezas acopladas**: tocar una sin la otra deja el circuito roto, que es
 * como estuvo hasta la tanda 2. El destino viaja en el `state` del historial y
 * nunca en la URL, a propósito: un `?next=` en la barra de direcciones sería un
 * vector de redirección abierta. `Login` además descarta lo que no empiece por
 * `/`, lo que empiece por `//` y el propio `/`, para no entrar en bucle.
 *
 * ── Otras trampas ────────────────────────────────────────────────────────────
 * - Su pantalla de espera es el tercero de tres estilos de espera que conviven
 *   en el mismo flujo, junto al `PageFallback` de `App.jsx` y los `Alert` de los
 *   guards de proceso.
 *
 * @example
 * // Declaración única en App.jsx: envuelve, no se anida por página
 * <Route element={<ProtectedRoute />}>
 *   <Route element={<DashboardLayout />}>
 *     <Route path="/logs" element={<Logs />} />
 *     <Route path="/mantenimiento" element={<Maintenance />} />
 *   </Route>
 * </Route>
 */
export function ProtectedRoute() {
  const { isChecking, isAuthenticated } = useAuth();
  const location = useLocation();

  if (isChecking) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-muted-text)' }}>
        Validando sesion...
      </div>
    );
  }

  if (!isAuthenticated) {
    // El destino viaja en el `state` del historial, no en la URL: un `?next=`
    // en la barra de direcciones seria un vector de redireccion abierta.
    return <Navigate to="/" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
