import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/shared/utils/apiClient';

/**
 * Endpoint de indicadores propio de cada proceso. El Dashboard solo conoce la
 * URL: el SQL de cada dominio vive en su módulo del backend, con su propio
 * `requireProcess`.
 */
const PROCESS_DASHBOARD_ENDPOINTS = {
  international_purchases: '/api/international-purchases/dashboard-summary',
  material_revaluation: '/api/material-revaluations/dashboard-summary',
};

/**
 * Una sección = una petición con su propio estado. Es deliberado: antes un solo
 * `throw` vaciaba el Dashboard entero, así que un 403 en el endpoint de un
 * proceso dejaba al usuario sin ver tampoco lo transversal.
 *
 * `enabled` en false no dispara la petición y limpia el estado, para que una
 * sección que deja de aplicar no conserve los datos del proceso anterior.
 */
function useEndpoint(url, enabled = true) {
  const [state, setState] = useState({
    data: null,
    isLoading: Boolean(url) && enabled,
    error: null,
    status: null,
  });

  const load = useCallback(async () => {
    if (!url || !enabled) {
      setState({ data: null, isLoading: false, error: null, status: null });
      return;
    }

    setState((previous) => ({ ...previous, isLoading: true, error: null }));

    let status = null;

    try {
      const response = await apiFetch(url);
      status = response.status;
      const json = await response.json();

      if (!response.ok || !json.success) {
        throw new Error(json.message || 'No se pudo obtener la información');
      }

      setState({ data: json.data, isLoading: false, error: null, status });
    } catch (error) {
      // El status se conserva para poder distinguir un 403 —falta de permiso,
      // que se explica— de un fallo real del servidor.
      setState({ data: null, isLoading: false, error: error.message, status });
    }
  }, [url, enabled]);

  useEffect(() => {
    load();
  }, [load]);

  return { ...state, reload: load };
}

/**
 * useDashboardData — orquesta las seis peticiones del Dashboard general.
 *
 * Devuelve una sección por bloque de la pantalla, cada una con
 * `{ data, isLoading, error, reload }`. El consumidor decide qué pinta y qué
 * degrada, sin que el fallo de una arrastre a las demás.
 *
 * @param {string} selectedProcessCode - Código del proceso, o `'ALL'`.
 * @param {{ isMasterAuditor: boolean, hasExecutions: boolean }} options -
 *   `isMasterAuditor` habilita el desglose por proceso, que solo tiene sentido
 *   con más de un proceso visible. `hasExecutions` en false apaga los cuatro
 *   endpoints transversales: hay procesos que no se orquestan con n8n y cuyas
 *   ejecuciones, por tanto, no existen en el esquema `audit` (ver
 *   `PROCESSES_WITHOUT_EXECUTIONS` en el Dashboard). No es solo ahorro de red:
 *   `isInitialLoading` y `blockingError` se derivan de `summary`, así que sin
 *   esto un fallo de un endpoint que ya no se pinta seguiría bloqueando la
 *   pantalla entera.
 */
export function useDashboardData(
  selectedProcessCode,
  { isMasterAuditor = false, hasExecutions = true } = {},
) {
  const isAllProcesses = !selectedProcessCode || selectedProcessCode === 'ALL';

  const query = useMemo(() => {
    const params = new URLSearchParams();

    if (!isAllProcesses) {
      params.set('processCode', selectedProcessCode);
    }

    return params.toString();
  }, [isAllProcesses, selectedProcessCode]);

  const suffix = query ? `?${query}` : '';

  const processEndpoint = isAllProcesses
    ? null
    : PROCESS_DASHBOARD_ENDPOINTS[selectedProcessCode] || null;

  const summary = useEndpoint(`/api/dashboard/summary${suffix}`, hasExecutions);
  const executions = useEndpoint(
    `/api/executions?${query ? `${query}&` : ''}limit=5`,
    hasExecutions,
  );
  const timeseries = useEndpoint(`/api/dashboard/timeseries${suffix}`, hasExecutions);
  const topErrors = useEndpoint(`/api/dashboard/top-errors${suffix}`, hasExecutions);
  const byProcess = useEndpoint(
    '/api/dashboard/by-process',
    hasExecutions && isMasterAuditor && isAllProcesses,
  );
  const processKpis = useEndpoint(processEndpoint, Boolean(processEndpoint));

  const reloadAll = useCallback(() => {
    summary.reload();
    executions.reload();
    timeseries.reload();
    topErrors.reload();
    byProcess.reload();
    processKpis.reload();
  }, [summary, executions, timeseries, topErrors, byProcess, processKpis]);

  return {
    summary,
    executions,
    timeseries,
    topErrors,
    byProcess,
    processKpis,
    hasProcessKpis: Boolean(processEndpoint),
    reloadAll,
  };
}
