import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal, ModalFooter } from '@/shared/components/Modal/Modal';
import { Button } from '@/shared/components/Button/Button';
import { useAuth } from '@/shared/context/useAuth';

// Un 401 no siempre significa lo mismo, y decirle a alguien que "entraron con su
// cuenta" cuando en realidad caducó su token —o al revés— es peor que no decir
// nada. El backend manda el motivo en `code`; aquí solo se traduce.
const SESSION_END_REASONS = {
  SESSION_REVOKED: {
    title: 'Se inició sesión en otro dispositivo',
    subtitle: 'Tu cuenta solo puede estar activa en un lugar a la vez.',
    body:
      'Tu sesión aquí se cerró porque alguien entró con tu usuario desde otro ' +
      'dispositivo o navegador. Si no fuiste tú, cambia tu contraseña y avisa al ' +
      'administrador. ',
  },
  SESSION_CLOSED_BY_ADMIN: {
    title: 'Un administrador cerró tu sesión',
    subtitle: 'Tu acceso sigue activo: puedes volver a entrar.',
    body: '',
  },
  default: {
    title: 'Tu sesión expiró',
    subtitle: 'Por seguridad, la sesión se cerró.',
    body: '',
  },
};

/**
 * SessionExpiredModal — Aviso de sesión caducada. **Se activa solo, sin props.**
 *
 * No se le pasa nada ni se controla desde fuera: se monta una vez y escucha el
 * evento global `window 'session:expired'`. Quien lo dispara es `apiClient.js`
 * cuando una petición responde 401, así que **cualquier llamada a la API puede
 * abrir este modal desde cualquier pantalla**. Ese acoplamiento por evento es lo
 * que hace que no necesite props, y también lo que lo vuelve invisible al leer
 * el JSX del layout.
 *
 * Ya está montado en `DashboardLayout`, dentro del área autenticada: **no
 * volver a montarlo** en una página o se abrirían dos avisos con el mismo
 * evento.
 *
 * ── Dos salidas, deliberadamente ─────────────────────────────────────────────
 * - **"Seguir aquí"** solo cierra el aviso. No renueva nada: la sesión sigue
 *   caducada y la siguiente petición volverá a fallar. Existe para que quien
 *   tenga un formulario a medio llenar pueda copiar su contenido antes de salir.
 * - **"Iniciar sesión"** hace `logout()` y navega a `/` con `replace`, así que
 *   se pierde todo el estado no guardado.
 *
 * El modal es descartable por Escape y por click en el fondo (lo hereda de
 * `Modal`), equivalentes a "Seguir aquí".
 *
 * ── Tres motivos, tres textos ────────────────────────────────────────────────
 * El evento trae `detail.code` y `SESSION_END_REASONS` lo traduce:
 * `SESSION_REVOKED` (entraron con la misma cuenta desde otro dispositivo),
 * `SESSION_CLOSED_BY_ADMIN`, y el genérico "tu sesión expiró". No es cosmético:
 * el primero **es la única señal que recibe el usuario legítimo de que sus
 * credenciales se están usando en otro sitio**, así que el texto también le dice
 * qué hacer. Y por el mismo motivo el backend **no** manda `SESSION_REVOKED`
 * cuando la sesión se cerró por un logout propio: sería una alarma falsa.
 *
 * Trampa: si el evento se dispara mientras el aviso ya está abierto, no pasa
 * nada visible — `setIsOpen(true)` sobre un modal abierto es idempotente. Pero
 * si el usuario acaba de pulsar "Seguir aquí" y otra petición falla, el aviso
 * reaparece; es el comportamiento correcto, no un bucle.
 *
 * Trampa: `apiClient` **no** emite el evento para un 401 de `/auth/logout`.
 * Cerrar sesión sobre una sesión ya revocada responde 401, y sin esa excepción
 * el aviso se reabriría justo mientras el usuario sale.
 *
 * @example
 * // Montaje único, dentro del layout autenticado (ya hecho en DashboardLayout)
 * <SessionExpiredModal />
 *
 * @example
 * // Cómo se dispara desde el cliente de API (apiClient.js)
 * window.dispatchEvent(
 *   new CustomEvent('session:expired', { detail: { code: data?.code } }),
 * );
 */
export function SessionExpiredModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [code, setCode] = useState(null);
  const navigate = useNavigate();
  const { logout } = useAuth();

  useEffect(() => {
    const handler = (event) => {
      setCode(event.detail?.code ?? null);
      setIsOpen(true);
    };
    window.addEventListener('session:expired', handler);
    return () => window.removeEventListener('session:expired', handler);
  }, []);

  const reason = SESSION_END_REASONS[code] || SESSION_END_REASONS.default;

  const handleRelogin = async () => {
    setIsOpen(false);
    await logout();
    navigate('/', { replace: true });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => setIsOpen(false)}
      title={reason.title}
      subtitle={reason.subtitle}
    >
      <p style={{ margin: '0 0 1rem' }}>
        {reason.body}
        Vuelve a iniciar sesión para continuar. Nada de lo que ves en pantalla se ha
        cerrado: si tienes un formulario a medio llenar, ciérra este aviso, copia lo que
        necesites y luego vuelve a entrar.
      </p>
      <ModalFooter>
        <Button variant="secondary" onClick={() => setIsOpen(false)}>Seguir aquí</Button>
        <Button variant="primary" onClick={handleRelogin}>Iniciar sesión</Button>
      </ModalFooter>
    </Modal>
  );
}
