import { useContext } from 'react';
import { ToastContext } from './toast-context';

/**
 * useToast — Acceso a las notificaciones efímeras.
 *
 * Devuelve el objeto `{ notify, success, error, info, dismiss }` que expone
 * `ToastProvider`. La API completa y sus trampas (la duración corta de
 * `toast.error`, la ausencia de tipo `warning`) están documentadas en
 * `Toast.jsx`.
 *
 * **Lanza `Error` si se usa fuera de `<ToastProvider>`.** No devuelve `null` ni
 * degrada en silencio: revienta en el render. En la práctica no ocurre porque el
 * provider envuelve todas las rutas en `App.jsx`, pero sí puede pasar al probar
 * un componente aislado — ahí hay que envolverlo en el provider.
 *
 * @returns {{
 *   notify:  (mensaje: string, opciones?: Object) => number,
 *   success: (mensaje: string, opciones?: Object) => number,
 *   error:   (mensaje: string, opciones?: Object) => number,
 *   info:    (mensaje: string, opciones?: Object) => number,
 *   dismiss: (id: number) => void,
 * }} Objeto de notificaciones.
 * @throws {Error} Si no hay un `ToastProvider` por encima.
 *
 * @example
 * function MiPagina() {
 *   const toast = useToast();
 *
 *   const guardar = async () => {
 *     try {
 *       await api.guardar(datos);
 *       toast.success('Solicitud guardada correctamente.');
 *     } catch {
 *       toast.error('No se pudo guardar.', { duration: 0 });
 *     }
 *   };
 * }
 */
export function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error('useToast debe usarse dentro de <ToastProvider>');
  }

  return context;
}
