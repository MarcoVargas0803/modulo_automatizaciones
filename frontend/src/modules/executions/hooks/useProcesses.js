import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/shared/utils/apiClient';

/**
 * useProcesses — carga los procesos que el usuario tiene asignados.
 *
 * `GET /api/processes` ya filtra por `user_process_access` con `can_view`, así
 * que la lista que devuelve es exactamente la que el usuario puede consultar: no
 * hay que volver a filtrarla en el cliente.
 *
 * El hook **solo carga**. La selección de proceso no le pertenece: el Dashboard
 * la persiste en `localStorage` y Logs la lleva en la URL, y meter aquí ese
 * estado obligaría a que el hook conociera las dos convenciones.
 *
 * Vive en `modules/executions/hooks/` y no en `shared/` porque sus dos
 * consumidores —Dashboard y Logs— son páginas del mismo módulo.
 *
 * @returns {{
 *   processes: {process_code: string, process_name: string, description: string, can_view: boolean, can_export: boolean}[],
 *   isLoading: boolean,
 *   error: string | null,
 *   reload: () => Promise<void>
 * }}
 *
 * @example
 * const { processes, isLoading, error, reload } = useProcesses();
 *
 * @example
 * // Como opciones de un filtro
 * {processes.map((p) => (
 *   <option key={p.process_code} value={p.process_code}>{p.process_name}</option>
 * ))}
 */
export function useProcesses() {
  const [processes, setProcesses] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await apiFetch('/api/processes');
      const json = await response.json();

      if (!response.ok || !json.success) {
        throw new Error(json.message || 'Error al obtener procesos');
      }

      setProcesses(json.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { processes, isLoading, error, reload };
}
