import React, { useMemo } from 'react';
import { LayoutGrid } from 'lucide-react';
import { Tabs, Tab } from '@/shared/components/Tabs/Tabs';
import { relativeTime } from '@/shared/utils/relativeTime';
import './WorkspaceHeader.css';

/**
 * WorkspaceHeader — la zona «Contexto» de una estación de la Consola.
 *
 * Responde, antes que cualquier otra cosa en la página, a "¿está todo bien?" y
 * "¿cuándo fue lo último?". Vive directo sobre el lienzo (sin caja propia,
 * ver Parte IV del documento de diseño). No es sticky (Parte X: lo era, pero
 * tapaba contenido en pantallas bajas) — el Topbar es el único elemento
 * persistente.
 *
 * El selector de proceso vive aquí y no en el Topbar: es contexto de esta
 * estación, no chrome global de toda la app.
 *
 * @param {string} [displayName]        - Nombre para el saludo. Sin él cae a un saludo neutro.
 * @param {boolean} isLoading           - Si el resumen transversal todavía no llegó (veredicto neutro).
 * @param {number}  [errorExecutions]   - `summaryData.error_executions`. Decide el veredicto.
 * @param {boolean} hasExecutions       - Si el proceso seleccionado produce ejecuciones (si no, no hay veredicto de ejecuciones que dar).
 * @param {string}  [lastExecutionAt]   - `created_at_mx` de la ejecución más reciente.
 * @param {string}  selectedProcessCode
 * @param {(code: string) => void} onSelectProcess
 * @param {boolean} isMasterAuditor
 * @param {Object[]} processes
 * @param {Object}  processIcons        - Mapa `process_code` → componente de icono.
 * @param {React.ComponentType} processIconFallback
 */
export function WorkspaceHeader({
  displayName,
  isLoading,
  errorExecutions,
  hasExecutions,
  lastExecutionAt,
  selectedProcessCode,
  onSelectProcess,
  isMasterAuditor,
  processes,
  processIcons,
  processIconFallback: ProcessIconFallback,
}) {
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    const saludo = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';
    const nombre = displayName?.split(' ')[0];
    return nombre ? `${saludo}, ${nombre}` : saludo;
  }, [displayName]);

  const today = useMemo(
    () => new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date()),
    [],
  );

  // El veredicto es cualitativo a propósito: la cifra exacta de ejecuciones
  // con error ya vive en la tarjeta "Ejecuciones con Error" del riel de
  // OperationalHealth, una fila más abajo. Repetirla aquí era el mismo
  // número en dos lugares — este texto responde "¿debo mirar con cuidado?",
  // no "¿cuántas?".
  const status = useMemo(() => {
    if (isLoading) return { tone: 'info', text: 'Sincronizando datos…' };
    if (!hasExecutions) return { tone: 'info', text: 'Este proceso no produce ejecuciones.' };
    if ((errorExecutions || 0) > 0) return { tone: 'error', text: 'Requiere atención' };
    return { tone: 'success', text: 'Operando con normalidad' };
  }, [isLoading, hasExecutions, errorExecutions]);

  return (
    <header className="workspace-header">
      <div className="workspace-header-row">
        <div className="workspace-header-greeting">
          <h1 className="workspace-header-title">{greeting}</h1>
          <p className="workspace-header-date">{today}</p>
        </div>

        <div className="workspace-header-status">
          <span className={`workspace-status-dot workspace-status-${status.tone}`} aria-hidden="true" />
          <span className="workspace-status-text">{status.text}</span>
          {hasExecutions && lastExecutionAt && (
            <span className="workspace-header-lastsync">
              · Última ejecución {relativeTime(lastExecutionAt)}
            </span>
          )}
        </div>
      </div>

      <Tabs
        value={selectedProcessCode}
        onChange={onSelectProcess}
        ariaLabel="Procesos disponibles"
        className="workspace-process-tabs"
      >
        {isMasterAuditor && (
          <Tab value="ALL" label="Mostrar todos los procesos" icon={LayoutGrid} />
        )}
        {processes.map((process) => (
          <Tab
            key={process.process_code}
            value={process.process_code}
            label={process.process_name}
            icon={processIcons[process.process_code] || ProcessIconFallback}
          />
        ))}
      </Tabs>
    </header>
  );
}
