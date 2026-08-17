import React, { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { Link as RouterLink, useOutletContext, useNavigate } from 'react-router-dom';
import {
  ShieldAlert,
  UserCog, Ship, Wrench, Boxes, Banknote, Workflow,
} from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { DataCard } from '@/shared/components/DataCard/DataCard';
import { DataTable } from '@/shared/components/DataTable/DataTable';
import { Badge } from '@/shared/components/Badge/Badge';
import { statusVariant } from '@/shared/utils/statusVariant';
import { RelatedDocuments } from '@/shared/components/RelatedDocuments/RelatedDocuments';
import { EmptyState } from '@/shared/components/EmptyState/EmptyState';
import { Skeleton } from '@/shared/components/Skeleton/Skeleton';
import { PageHeader } from '@/shared/components/PageHeader/PageHeader';
import { Hint } from '@/shared/components/Hint/Hint';
import { ChartCard } from '@/modules/executions/components/ChartCard/ChartCard';
import { CategoryBarChart } from '@/modules/executions/components/CategoryBarChart/CategoryBarChart';
import { WorkspaceHeader } from '@/modules/executions/components/WorkspaceHeader/WorkspaceHeader';
import { OperationalHealth } from '@/modules/executions/components/OperationalHealth/OperationalHealth';
import { ActivityTimeline } from '@/modules/executions/components/ActivityTimeline/ActivityTimeline';
// Diferido a propósito: arrastra Leaflet (~150 kB) y solo lo usa compras
// internacionales. Sin esto, quien mira pagos o mantenimiento descargaría un
// mapa que nunca va a ver, sobre un chunk de Dashboard que ya es el más pesado.
const ShipmentMap = lazy(() => import('@/modules/executions/components/ShipmentMap/ShipmentMap')
  .then((m) => ({ default: m.ShipmentMap })));
import { useAuth } from '@/shared/context/useAuth';
import { useDashboardData } from '@/modules/executions/hooks/useDashboardData';
import { useProcesses } from '@/modules/executions/hooks/useProcesses';
import { buildProcessKpis } from '@/modules/executions/utils/processKpis';
import {
  CHART_GRID_STROKE,
  CHART_AXIS_TICK,
  CHART_AXIS_LINE,
  CHART_TOOLTIP_CONTENT_STYLE,
  CHART_TOOLTIP_LABEL_STYLE,
  CHART_TOOLTIP_ITEM_STYLE,
  CHART_TOOLTIP_CURSOR,
  EXECUTION_STATUS_SERIES,
  num,
  shortDateLabel,
} from '@/modules/executions/utils/chartTheme';
import './Dashboard.css';

const SELECTED_PROCESS_KEY = 'dashboard.selectedProcessCode';

/**
 * Icono de cada pestaña de proceso. La clave es el `process_code` de
 * `audit_portal.processes`, nunca el `process_name`: el nombre es editable desde
 * /administracion y el código no.
 *
 * Se declara el componente, no el elemento (`Ship`, no `<Ship />`): es lo que
 * espera la prop `icon` de `Tab`, que lo instancia a 16px.
 */
const PROCESS_ICONS = {
  admin: UserCog,
  international_purchases: Ship,
  maintenance: Wrench,
  material_revaluation: Boxes,
  payments: Banknote,
};

// Un proceso dado de alta después de este código no se queda sin icono: cada
// proceso es al final un flujo de n8n, así que el genérico es coherente.
const PROCESS_ICON_FALLBACK = Workflow;

/**
 * Procesos que no se orquestan con n8n y por tanto no producen ejecuciones.
 *
 * Sus datos viven en su propio esquema —mantenimiento, en `maintenance`— y nunca
 * llegan a `audit`, del que se alimenta todo el bloque transversal. Con la
 * pestaña seleccionada, las 8 tarjetas de ejecuciones, la serie temporal, el top
 * de errores y «Ejecuciones Recientes» salían estructuralmente en cero: no era
 * una racha vacía, era una pregunta que no aplica.
 *
 * Es una lista explícita y no un `total_executions === 0` a propósito: un cero
 * transitorio en un proceso que sí se orquesta es información, y ocultarlo
 * mentiría. Si mañana mantenimiento se integra con n8n, basta con sacarlo de
 * aquí.
 */
const PROCESSES_WITHOUT_EXECUTIONS = ['maintenance'];

export function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const {
    processes: processesData,
    isLoading: isLoadingProcesses,
    error: processesError,
    reload: reloadProcesses,
  } = useProcesses();

  const [selectedProcessCode, setSelectedProcessCode] = useState(
    () => window.localStorage.getItem(SELECTED_PROCESS_KEY) || 'ALL',
  );

  const isMasterAuditor = useMemo(() => processesData.length > 1, [processesData]);

  const hasExecutions = !PROCESSES_WITHOUT_EXECUTIONS.includes(selectedProcessCode);

  // El contador ya lo poll-ea DashboardLayout (SSE + intervalo); llega por
  // `Outlet context` en vez de una petición propia, para no duplicar el poll.
  const { pendingRevaluations = 0 } = useOutletContext() || {};
  const canAccessRevaluations = useMemo(
    () => processesData.some((p) => p.process_code === 'material_revaluation'),
    [processesData],
  );

  const {
    summary, executions, timeseries, topErrors, byProcess, processKpis, reloadAll,
  } = useDashboardData(selectedProcessCode, { isMasterAuditor, hasExecutions });

  const summaryData = summary.data;
  const executionsData = executions.data || [];

  const isMaterialRevaluationView = useMemo(() => (
    selectedProcessCode === 'material_revaluation' ||
    (!isMasterAuditor && processesData.length === 1 && processesData[0]?.process_code === 'material_revaluation')
  ), [isMasterAuditor, processesData, selectedProcessCode]);

  // Normaliza la selección contra la lista real. Los dos guards son necesarios:
  // sin el de carga, el efecto correría con el `[]` inicial del hook y devolvería
  // a 'ALL' el proceso que venía de localStorage antes de que la petición
  // resolviera; sin el de error, un fallo de red haría lo mismo, porque una lista
  // vacía por fallo es indistinguible de un usuario sin procesos asignados.
  useEffect(() => {
    if (isLoadingProcesses || processesError) return;

    if (processesData.length === 1) {
      setSelectedProcessCode(processesData[0].process_code);
      return;
    }

    setSelectedProcessCode((current) =>
      current === 'ALL' || processesData.some((p) => p.process_code === current) ? current : 'ALL',
    );
  }, [processesData, isLoadingProcesses, processesError]);

  useEffect(() => {
    window.localStorage.setItem(SELECTED_PROCESS_KEY, selectedProcessCode);
  }, [selectedProcessCode]);

  const columns = [
    {
      header: (
        <>
          ID Ejecución
          <Hint text="Código identificador único de la ejecución del proceso" position="bottom" />
        </>
      ),
      accessor: 'execution_id',
      cell: (row) => <span className="execution-id-cell" title={row.execution_id}>{row.execution_id}</span>
    },
    {
      header: (
        <>
          Proceso
          <Hint text="Nombre del proceso o auditoría ejecutada" position="bottom" />
        </>
      ),
      accessor: 'process_name'
    },
    ...(isMaterialRevaluationView ? [{
      header: (
        <>
          Documentos
          <Hint text="Documento al que se hace referencia en SAP" position="bottom" />
        </>
      ),
      accessor: 'related_documents',
      cell: (row) => <RelatedDocuments documents={row.related_documents} />
    }] : []),
    {
      header: (
        <>
          Estado
          <Hint text="Estado actual del proceso (Exitoso, Con Errores, En Proceso)" position="bottom" />
        </>
      ),
      accessor: 'display_status',
      cell: (row) => (
        <Badge variant={statusVariant(row.display_status)} size="sm">
          {row.display_status}
        </Badge>
      )
    },
    {
      header: (
        <>
          Fecha de Creación
          <Hint text="Fecha y hora en la que se inició la ejecución" position="bottom" />
        </>
      ),
      accessor: 'created_at_mx',
      cell: (row) => row.created_at_mx ? new Date(row.created_at_mx).toLocaleString('es-MX', { timeZone: 'UTC', dateStyle: 'short', timeStyle: 'short' }) : '-'
    },
  ];

  const formatDuration = (ms) => { if (!ms) return '0s'; const s = Math.floor(ms / 1000); const m = Math.floor(s / 60); return m > 0 ? `${m}m ${s % 60}s` : `${s}s`; };
  const calcRate = (ok, total) => total ? `${Math.round((ok / total) * 100)}%` : '0%';
  const getLogsHref = () => selectedProcessCode === 'ALL' ? '/logs' : `/logs?processCode=${encodeURIComponent(selectedProcessCode)}`;
  const getStatusHref = (status) => { const p = new URLSearchParams(); p.set('status', status); if (selectedProcessCode !== 'ALL') p.set('processCode', selectedProcessCode); return `/logs?${p.toString()}`; };

  // Solo se pintan las series con al menos un valor: con 4 procesos activos, una
  // leyenda con estados que nunca ocurren estorba más de lo que informa.
  const timeseriesRows = timeseries.data || [];
  const activeStatusSeries = useMemo(() => EXECUTION_STATUS_SERIES.filter(
    (serie) => timeseriesRows.some((row) => num(row[serie.key]) > 0),
  ), [timeseriesRows]);

  const byProcessRows = useMemo(() => (byProcess.data || []).map((row) => ({
    ...row,
    process_name: row.process_name || row.process_code,
  })), [byProcess.data]);

  const topErrorRows = useMemo(() => (topErrors.data || []).map((row) => ({
    ...row,
    label: row.node_name,
    error_count: num(row.error_count),
  })), [topErrors.data]);

  const processSection = useMemo(
    () => buildProcessKpis(selectedProcessCode, processKpis.data),
    [selectedProcessCode, processKpis.data],
  );
  const actionCards = (processSection?.cards || []).filter((card) => card.category === 'action');
  const healthCards = (processSection?.cards || []).filter((card) => card.category !== 'action');

  const isInitialLoading = (isLoadingProcesses || summary.isLoading) && !summaryData;
  const isRefreshing = summary.isLoading && Boolean(summaryData);
  const blockingError = processesError || (summary.error && !summaryData ? summary.error : null);

  const totalEvents = num(summaryData?.total_events);
  const errorEvents = num(summaryData?.error_events);

  const healthStats = useMemo(() => ([
    {
      id: 'total',
      label: 'Total Ejecuciones',
      value: summaryData?.total_executions?.toString() || '0',
      linkHref: getLogsHref(),
    },
    {
      id: 'errors',
      label: 'Ejecuciones con Error',
      value: summaryData?.error_executions?.toString() || '0',
      tone: num(summaryData?.error_executions) > 0 ? 'error' : undefined,
      linkHref: getStatusHref('ERROR'),
    },
    {
      id: 'in_progress',
      label: 'En Proceso',
      value: summaryData?.in_progress_executions?.toString() || '0',
      tone: 'info',
      linkHref: getStatusHref('EN PROCESO'),
    },
    {
      id: 'incomplete',
      label: 'Atascadas',
      value: summaryData?.incomplete_executions?.toString() || '0',
      tone: num(summaryData?.incomplete_executions) > 0 ? 'warning' : undefined,
      linkHref: getStatusHref('INCOMPLETA'),
    },
    {
      id: 'events',
      label: 'Eventos con Error',
      value: `${errorEvents} / ${totalEvents}`,
      tone: errorEvents > 0 ? 'error' : undefined,
    },
    {
      id: 'avg_duration',
      label: 'Duración Promedio',
      value: formatDuration(summaryData?.average_duration_ms),
    },
    {
      id: 'median_duration',
      label: 'Mediana de Duración',
      value: formatDuration(summaryData?.p50_duration_ms),
    },
  ]), [summaryData, selectedProcessCode, errorEvents, totalEvents]);

  // Extraído para poder pintarlo dentro de `.dashboard-columns` (junto a
  // ActivityTimeline, que ahora arranca desde el inicio de la pestaña) cuando
  // `hasExecutions`, y suelto cuando no (ej. mantenimiento).
  const processContent = processSection && (
    <>
      {/* Dos zonas por peso, no por tipo de dato: "Mi trabajo" son las
          tarjetas con una acción clara pendiente (cola, algo esperando
          respuesta); "Salud del proceso" son conteos de diagnóstico sin
          acción directa. La cifra transversal (ejecuciones, tasa de éxito)
          sigue siendo cosa de `OperationalHealth`, más abajo — esto es
          solo lo propio de cada proceso. */}
      {actionCards.length > 0 && (
        <section className={processKpis.isLoading ? 'is-refreshing' : ''}>
          <div className="section-header">
            <h2 className="section-title">Mi trabajo</h2>
          </div>
          <div className="dashboard-grid dashboard-grid--action">
            {actionCards.map((card) => (
              <DataCard
                key={card.id}
                title={card.title}
                value={card.value}
                icon={card.icon}
                tone={card.tone}
                linkText={card.linkText}
                linkHref={card.linkHref}
              />
            ))}
          </div>
        </section>
      )}

      {healthCards.length > 0 && (
        <section className={processKpis.isLoading ? 'is-refreshing' : ''}>
          <div className="section-header">
            <h2 className="section-title">Salud del proceso</h2>
          </div>
          <div className="dashboard-grid">
            {healthCards.map((card) => (
              <DataCard
                key={card.id}
                title={card.title}
                value={card.value}
                icon={card.icon}
                tone={card.tone}
                linkText={card.linkText}
                linkHref={card.linkHref}
              />
            ))}
          </div>
        </section>
      )}

      <div className="dashboard-chart-grid">
        {processSection.charts.map((chart) => (
          <ChartCard
            key={chart.id}
            title={chart.title}
            subtitle={chart.subtitle}
            isLoading={processKpis.isLoading}
            error={null}
            isEmpty={chart.data.length === 0}
            height={Math.max(240, chart.layout === 'vertical' ? chart.data.length * 36 + 70 : 260)}
          >
            <CategoryBarChart chart={chart} />
          </ChartCard>
        ))}
      </div>

      {/* El mapa va entre las gráficas y las tablas. Reutiliza `ChartCard` para
          heredar sus cuatro estados y su borde, en vez de inventar otra sección:
          lo único propio del mapa es su contenido. */}
      {processSection.map && (
        <ChartCard
          key={processSection.map.id}
          title={processSection.map.title}
          subtitle={processSection.map.subtitle}
          isLoading={processKpis.isLoading}
          error={null}
          isEmpty={processSection.map.points.length === 0}
          emptyMessage={processSection.map.emptyMessage}
          height={420}
        >
          <Suspense fallback={<Skeleton height={404} borderRadius="var(--radius-md)" />}>
            <ShipmentMap points={processSection.map.points} />
          </Suspense>
        </ChartCard>
      )}

      {(processSection.tables || []).map((table) => (
        <section
          key={table.id}
          className={`dashboard-section ${processKpis.isLoading ? 'is-refreshing' : ''}`}
        >
          <div className="section-header">
            <div>
              <h2 className="section-title">{table.title}</h2>
              {table.subtitle && <p className="section-subtitle">{table.subtitle}</p>}
            </div>
          </div>
          <DataTable
            columns={table.columns}
            data={table.data}
            isLoading={processKpis.isLoading}
            emptyMessage={table.emptyMessage}
          />
        </section>
      ))}
    </>
  );

  // Va antes que `OperationalHealth` y no al final de la página: es lo que
  // explica el hueco que deja el bloque de arriba, y para un proceso sin
  // ejecuciones —donde todo lo transversal está oculto— es lo único que se
  // llega a ver.
  const processErrorNotice = processKpis.error && (
    <EmptyState
      tone="error"
      icon={ShieldAlert}
      title="Indicadores del proceso no disponibles"
      description={processKpis.status === 403
        ? `Tu perfil no tiene permiso para consultar los indicadores de este proceso.${hasExecutions ? ' El resto del Dashboard sigue disponible.' : ''}`
        : processKpis.error}
      action={processKpis.status === 403 ? undefined : { label: 'Reintentar', onClick: processKpis.reload }}
      className="dashboard-notice"
    />
  );

  if (isInitialLoading || blockingError) {
    return (
      <div className="dashboard-page">
        <PageHeader
          title="Dashboard"
          subtitle={isInitialLoading ? 'Cargando resumen operativo…' : undefined}
        />

        {blockingError && (
          <EmptyState
            tone="error"
            title="Error al cargar el Dashboard"
            description={blockingError}
            action={{
              label: 'Reintentar',
              onClick: () => {
                reloadProcesses();
                reloadAll();
              },
            }}
          />
        )}

        {isInitialLoading && (
          <div className="dashboard-grid" role="status" aria-label="Cargando indicadores" aria-busy="true">
            {Array.from({ length: 8 }).map((_, index) => (
              <DataCard key={index} isLoading />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="dashboard-page">
      <WorkspaceHeader
        displayName={user?.displayName || user?.username}
        isLoading={summary.isLoading && !summaryData}
        errorExecutions={summaryData?.error_executions}
        hasExecutions={hasExecutions}
        lastExecutionAt={executionsData[0]?.created_at_mx}
        selectedProcessCode={selectedProcessCode}
        onSelectProcess={setSelectedProcessCode}
        isMasterAuditor={isMasterAuditor}
        processes={processesData}
        processIcons={PROCESS_ICONS}
        processIconFallback={PROCESS_ICON_FALLBACK}
      />

      {hasExecutions ? (
        <div className="dashboard-columns">
          <div className={`dashboard-main-column ${isRefreshing ? 'is-refreshing' : ''}`}>
            {processContent}
            {processErrorNotice}

            <OperationalHealth
              successRateLabel={calcRate(summaryData?.successful_executions, summaryData?.finished_executions)}
              timeseriesRows={timeseriesRows}
              stats={healthStats}
              showByProcess={isMasterAuditor && selectedProcessCode === 'ALL'}
              byProcessRows={byProcessRows}
              otherExecutions={num(summaryData?.other_executions)}
            />

            <section className="dashboard-trend">
              <div className="section-header">
                <div>
                  <h2 className="section-title">Ejecuciones por día</h2>
                  <p className="section-subtitle">Últimos 30 días, por estado final.</p>
                </div>
              </div>
              <div className="chart-card-body" style={{ height: '280px' }}>
                {timeseries.isLoading ? (
                  <Skeleton height={264} borderRadius="var(--radius-md)" />
                ) : timeseries.error ? (
                  <EmptyState
                    tone="error"
                    title="No se pudo cargar esta sección"
                    description={timeseries.error}
                    action={{ label: 'Reintentar', onClick: timeseries.reload }}
                  />
                ) : !timeseriesRows.some((row) => num(row.total) > 0) ? (
                  <EmptyState title="Sin datos que graficar" description="No hubo ejecuciones en el periodo para el proceso seleccionado." />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={timeseriesRows} margin={{ top: 8, right: 16, bottom: 8, left: 0 }} accessibilityLayer>
                      <CartesianGrid stroke={CHART_GRID_STROKE} strokeDasharray="3 3" />
                      <XAxis dataKey="date" tickFormatter={shortDateLabel} tick={CHART_AXIS_TICK} axisLine={CHART_AXIS_LINE} tickLine={CHART_AXIS_LINE} minTickGap={16} />
                      <YAxis tick={CHART_AXIS_TICK} axisLine={CHART_AXIS_LINE} tickLine={CHART_AXIS_LINE} allowDecimals={false} />
                      <Tooltip
                        cursor={CHART_TOOLTIP_CURSOR}
                        contentStyle={CHART_TOOLTIP_CONTENT_STYLE}
                        labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                        itemStyle={CHART_TOOLTIP_ITEM_STYLE}
                      />
                      <Legend />
                      {activeStatusSeries.map((serie) => (
                        <Line
                          key={serie.key}
                          type="monotone"
                          dataKey={serie.key}
                          name={serie.label}
                          stroke={serie.color}
                          strokeWidth={2}
                          dot={{ r: 3, fill: serie.color, strokeWidth: 0 }}
                          activeDot={{ r: 5 }}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </section>

            <section className={`dashboard-section ${executions.isLoading ? 'is-refreshing' : ''}`}>
              <div className="section-header">
                <div>
                  <h2 className="section-title">Ejecuciones Recientes</h2>
                  <p className="section-subtitle">Últimos registros de ejecución.</p>
                </div>
                <RouterLink to={getLogsHref()} className="section-link">Ver todas las ejecuciones</RouterLink>
              </div>
              <DataTable
                columns={columns}
                data={executionsData}
                onRowClick={(row) => navigate(`/logs/${row.execution_id}`)}
              />
            </section>
          </div>

          {/* Antes vivía en esta misma columna, así que arrancaba a la altura
              de "Salud del proceso" y no desde el inicio de la pestaña. Ahora
              es hermano de toda la columna principal (incluye "Mi trabajo" y
              las gráficas), así que empieza junto al encabezado y su
              `position: sticky` (Dashboard.css) tiene toda esa altura para
              acompañar el scroll. */}
          <ActivityTimeline
            executions={executionsData}
            isLoadingExecutions={executions.isLoading}
            topErrors={topErrorRows}
            isLoadingTopErrors={topErrors.isLoading}
            canAccessRevaluations={canAccessRevaluations}
            pendingRevaluations={pendingRevaluations}
          />
        </div>
      ) : (
        <>
          {processContent}
          {processErrorNotice}
        </>
      )}
    </div>
  );
}
