import { useMemo } from 'react';
import { apiFetch } from '@/shared/utils/apiClient';

async function handle(promise) {
  try {
    const response = await promise;
    const data = await response.json();

    if (!response.ok || data.success === false) {
      const message = data.message || `Error del servidor (${response.status})`;
      // data.error solo viaja fuera de produccion (ver buildErrorResponse en el backend):
      // sin esto, el detalle real de un 500 nunca llegaba al toast, ni en desarrollo.
      return {
        success: false,
        message: data.error ? `${message} (${data.error})` : message,
      };
    }

    return data;
  } catch (err) {
    return { success: false, message: err.message || 'Error de conexión con el servidor' };
  }
}

function send(path, method, body) {
  return handle(apiFetch(path, { method, body: JSON.stringify(body) }));
}

export function useAdminApi() {
  return useMemo(
    () => ({
      getUsers: () => handle(apiFetch('/api/admin/users')),
      createUser: (data) => send('/api/admin/users', 'POST', data),
      updateUser: (id, data) => send(`/api/admin/users/${id}`, 'PUT', data),
      updateAccess: (id, access) => send(`/api/admin/users/${id}/access`, 'PUT', { access }),
      // Cierra la sesión abierta del usuario sin tocar su contraseña ni desactivarlo.
      logoutUser: (id) => send(`/api/admin/users/${id}/logout`, 'POST', {}),
      getProcesses: () => handle(apiFetch('/api/admin/processes')),
      setProcessActive: (code, isActive) =>
        send(`/api/admin/processes/${code}`, 'PUT', { is_active: isActive }),
      getActivity: (filters = {}) => {
        const params = new URLSearchParams();
        Object.entries(filters).forEach(([key, value]) => {
          if (value) params.append(key, value);
        });
        const query = params.toString();
        return handle(apiFetch(`/api/admin/activity${query ? `?${query}` : ''}`));
      },
      getHealth: () => handle(apiFetch('/api/admin/health')),
    }),
    [],
  );
}
