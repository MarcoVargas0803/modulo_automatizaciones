import React, { useCallback, useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import { DataTable } from '@/shared/components/DataTable/DataTable';
import { Badge } from '@/shared/components/Badge/Badge';
import { statusVariant } from '@/shared/utils/statusVariant';
import { RelatedDocuments } from '@/shared/components/RelatedDocuments/RelatedDocuments';
import { FilterBar } from '@/shared/components/FilterBar/FilterBar';
import { FilterSelectField, FilterDateField } from '@/shared/components/FilterBar/FilterFields';
import { Button } from '@/shared/components/Button/Button';
import { Pagination } from '@/shared/components/Pagination/Pagination';
import { EmptyState } from '@/shared/components/EmptyState/EmptyState';
import { PageHeader } from '@/shared/components/PageHeader/PageHeader';
import { Hint } from '@/shared/components/Hint/Hint';
import { apiFetch } from '@/shared/utils/apiClient';
import { useToast } from '@/shared/components/Toast/useToast';
import { useProcesses } from '@/modules/executions/hooks/useProcesses';
import './Logs.css';

const STATUS_LABELS = {
  EXITOSA: 'Exitosa',
  'EN PROCESO': 'En Proceso',
  INCOMPLETA: 'Incompleta',
  ERROR: 'Error',
};

export function Logs() {
  const navigate = useNavigate();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const { processes } = useProcesses();

  const processCodeFilter = searchParams.get('processCode') || '';
  const statusFilter = searchParams.get('status') || '';
  const dateFromFilter = searchParams.get('dateFrom') || '';
  const dateToFilter = searchParams.get('dateTo') || '';
  const sortOrder = searchParams.get('sortOrder') || 'newest';
  const currentPage = Math.max(parseInt(searchParams.get('page'), 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit'), 10) || 10, 1), 100);
  const urlSearch = searchParams.get('search') || '';

  const [searchTerm, setSearchTerm] = useState(urlSearch);
  const [logsData, setLogsData] = useState([]);
  const [totalResults, setTotalResults] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Filtros vigentes, los que viajan en la URL. Sirven de valor inicial del
  // borrador y de fuente para resincronizarlo cada vez que se abre el panel.
  const activeFilters = {
    processCode: processCodeFilter,
    status: statusFilter,
    dateFrom: dateFromFilter,
    dateTo: dateToFilter,
    sortOrder,
  };

  // Borrador del panel: no se aplica hasta pulsar "Aplicar". El toolbar avisa
  // con `onOpen` para resincronizarlo con los filtros vigentes.
  const [draftFilters, setDraftFilters] = useState(activeFilters);

  const hasActiveFilters =
    Boolean(processCodeFilter) ||
    Boolean(statusFilter) ||
    Boolean(dateFromFilter) ||
    Boolean(dateToFilter) ||
    sortOrder !== 'newest' ||
    Boolean(urlSearch);

  const updateParams = useCallback((patch) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [key, value] of Object.entries(patch)) {
        if (value === '' || value == null || value === 'newest') {
          next.delete(key);
        } else {
          next.set(key, String(value));
        }
      }
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  // Fuente única de los parámetros de filtrado, compartida por la tabla y la
  // exportación. Antes cada una armaba los suyos y se desincronizaron: el CSV
  // nunca mandaba `sortOrder`, así que salía siempre en orden descendente
  // aunque el toolbar pidiera "Más antiguo primero".
  const buildFilterParams = useCallback(() => {
    const params = new URLSearchParams();
    if (statusFilter) params.append('status', statusFilter);
    if (processCodeFilter) params.append('processCode', processCodeFilter);
    if (dateFromFilter) params.append('dateFrom', dateFromFilter);
    if (dateToFilter) params.append('dateTo', dateToFilter);
    if (urlSearch) params.append('search', urlSearch);
    if (sortOrder) params.append('sortOrder', sortOrder);
    return params;
  }, [statusFilter, processCodeFilter, dateFromFilter, dateToFilter, urlSearch, sortOrder]);

  const fetchLogs = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(false);

      const queryParams = buildFilterParams();
      queryParams.set('limit', limit);
      queryParams.set('page', currentPage);

      const response = await apiFetch(`/api/executions?${queryParams.toString()}`);
      const json = await response.json();

      if (!response.ok || !json.success) {
        throw new Error(json.message || 'Error al obtener los registros');
      }

      setLogsData(json.data || []);
      if (json.pagination) {
        setTotalPages(json.pagination.totalPages);
        setTotalResults(json.pagination.total ?? 0);
      }
    } catch (err) {
      setError(true);
      toast.error(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [buildFilterParams, currentPage, limit, toast]);

  useEffect(() => {
    const handle = setTimeout(() => {
      const trimmed = searchTerm.trim();
      if (trimmed !== urlSearch) {
        updateParams({ search: trimmed, page: 1 });
      }
    }, 250);

    return () => clearTimeout(handle);
  }, [searchTerm, urlSearch, updateParams]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // El toolbar cierra el panel por su cuenta; aquí solo se aplica el cambio.
  const handleApplyFilters = () => {
    // El backend rechaza el rango invertido con un 400, pero su detalle viaja en
    // `errors[]` y `fetchLogs` solo lee `message`: el usuario vería un "Filtros
    // inválidos" a secas. Se corta antes de salir a la red.
    if (draftFilters.dateFrom && draftFilters.dateTo && draftFilters.dateFrom > draftFilters.dateTo) {
      toast.error('La fecha "Desde" no puede ser posterior a la fecha "Hasta".');
      return;
    }

    updateParams({
      processCode: draftFilters.processCode,
      status: draftFilters.status,
      dateFrom: draftFilters.dateFrom,
      dateTo: draftFilters.dateTo,
      sortOrder: draftFilters.sortOrder,
      page: 1,
    });
  };

  const clearFilters = () => {
    setSearchTerm('');
    updateParams({
      processCode: '',
      status: '',
      dateFrom: '',
      dateTo: '',
      sortOrder: 'newest',
      search: '',
      page: 1,
    });
  };

  const goToPage = (page) => updateParams({ page });

  const showRelatedDocuments =
    processCodeFilter === 'material_revaluation' ||
    logsData.some((log) => log.process_code === 'material_revaluation');

  const renderRelatedDocuments = (row) => {
    // Fuera de revaluaciones la columna no aplica; con la lista vacía el propio
    // componente pinta el texto, que es para lo que existe `emptyLabel`.
    if (row.process_code !== 'material_revaluation') {
      return <RelatedDocuments documents={[]} emptyLabel="No aplica" />;
    }

    return <RelatedDocuments documents={row.related_documents} />;
  };

  const columns = [
    {
      header: (
        <>
          ID Ejecución
          <Hint text="Código identificador único de la ejecución del proceso" position="bottom" />
        </>
      ),
      accessor: 'execution_id'
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
    ...(showRelatedDocuments
      ? [
        {
          header: (
            <>
              Documentos
              <Hint text="Documento al que se hace referencia en SAP" position="bottom" />
            </>
          ),
          accessor: 'related_documents',
          cell: renderRelatedDocuments,
        },
      ]
      : []),
    {
      header: (
        <>
          Estado
          <Hint text="Estado actual del proceso (Exitosa, Incompleta, Error)" position="bottom" />
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
      cell: (row) => new Date(row.created_at_mx).toLocaleString('es-MX', { timeZone: 'UTC', dateStyle: 'short', timeStyle: 'short' })
    },
  ];

  const handleExportCSV = async () => {
    try {
      setIsExporting(true);

      // Sin `limit` ni `page`: se exporta el conjunto filtrado completo, no la
      // página que se está viendo.
      const queryParams = buildFilterParams();

      const response = await apiFetch(`/api/exports/executions.csv?${queryParams.toString()}`);
      if (!response.ok) {
        let errorMsg = 'Error al descargar el archivo CSV';
        try {
          const errorJson = await response.json();
          if (errorJson && errorJson.message) {
            errorMsg = errorJson.message;
          }
        } catch {
        }
        throw new Error(errorMsg);
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ejecuciones_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Exportacion CSV descargada.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setIsExporting(false);
    }
  };

  const isEmpty = !isLoading && !error && logsData.length === 0;

  // Mientras `useProcesses` carga —o si el código llega por URL y no está entre
  // los procesos del usuario— se muestra el código en crudo antes que dejar el
  // chip sin texto.
  const processLabel = processes.find((p) => p.process_code === processCodeFilter)?.process_name
    || processCodeFilter;

  const activeFilterChips = [
    urlSearch && {
      key: 'search',
      label: `Búsqueda: “${urlSearch}”`,
      onRemove: () => { setSearchTerm(''); updateParams({ search: '', page: 1 }); },
    },
    processCodeFilter && {
      key: 'processCode',
      label: `Proceso: ${processLabel}`,
      onRemove: () => updateParams({ processCode: '', page: 1 }),
    },
    statusFilter && {
      key: 'status',
      label: `Estado: ${STATUS_LABELS[statusFilter] || statusFilter}`,
      onRemove: () => updateParams({ status: '', page: 1 }),
    },
    dateFromFilter && {
      key: 'dateFrom',
      label: `Desde: ${dateFromFilter}`,
      onRemove: () => updateParams({ dateFrom: '', page: 1 }),
    },
    dateToFilter && {
      key: 'dateTo',
      label: `Hasta: ${dateToFilter}`,
      onRemove: () => updateParams({ dateTo: '', page: 1 }),
    },
    sortOrder === 'oldest' && {
      key: 'sortOrder',
      label: 'Orden: Más antiguo primero',
      onRemove: () => updateParams({ sortOrder: 'newest', page: 1 }),
    },
  ].filter(Boolean);

  return (
    <div className="logs-page" style={{ position: 'relative' }}>
      <PageHeader
        title="Registros de Ejecución"
        subtitle="Historial detallado de operaciones y estados"
      />
      <FilterBar
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Buscar por ID, proceso, referencia o documento..."
        searchAriaLabel="Buscar registros de ejecución"
        panelAriaLabel="Filtros de registros"
        hasActiveFilters={hasActiveFilters}
        onOpen={() => setDraftFilters(activeFilters)}
        onApply={handleApplyFilters}
        onClear={clearFilters}
        chips={activeFilterChips}
        onClearAll={clearFilters}
        actions={
          <Button variant="secondary" onClick={handleExportCSV} isLoading={isExporting}>
            {isExporting ? 'Exportando…' : 'Exportar CSV'}
          </Button>
        }
      >
        {/* Con un solo proceso asignado el desplegable sería "Todos" más una
            opción: no filtra nada. El chip y "Limpiar" siguen permitiendo quitar
            un processCode que llegue por URL en ese caso. */}
        {processes.length > 1 && (
          <FilterSelectField
            label="Proceso"
            id="filter-process"
            value={draftFilters.processCode}
            onChange={(value) => setDraftFilters({ ...draftFilters, processCode: value })}
          >
            <option value="">Todos los procesos</option>
            {processes.map((process) => (
              <option key={process.process_code} value={process.process_code}>
                {process.process_name}
              </option>
            ))}
          </FilterSelectField>
        )}

        <FilterSelectField
          label="Estado"
          id="filter-status"
          value={draftFilters.status}
          onChange={(value) => setDraftFilters({ ...draftFilters, status: value })}
        >
          <option value="">Todos</option>
          <option value="EXITOSA">Exitosa</option>
          <option value="EN PROCESO">En Proceso</option>
          <option value="INCOMPLETA">Incompleta</option>
          <option value="ERROR">Error</option>
        </FilterSelectField>

        {/* `max` y `min` cruzados para que el calendario nativo no ofrezca un
            rango invertido; teclear a mano sí puede, de ahí la guarda de
            handleApplyFilters. */}
        <FilterDateField
          label="Creadas desde"
          id="filter-date-from"
          value={draftFilters.dateFrom}
          onChange={(value) => setDraftFilters({ ...draftFilters, dateFrom: value })}
          max={draftFilters.dateTo || undefined}
        />

        <FilterDateField
          label="Creadas hasta"
          id="filter-date-to"
          value={draftFilters.dateTo}
          onChange={(value) => setDraftFilters({ ...draftFilters, dateTo: value })}
          min={draftFilters.dateFrom || undefined}
        />

        <FilterSelectField
          label="Orden"
          id="filter-order"
          value={draftFilters.sortOrder}
          onChange={(value) => setDraftFilters({ ...draftFilters, sortOrder: value })}
        >
          <option value="newest">Más reciente primero</option>
          <option value="oldest">Más antiguo primero</option>
        </FilterSelectField>
      </FilterBar>

      {!error && !(isLoading && logsData.length === 0) && (
        <p className="logs-result-count muted-text">
          {totalResults} registro{totalResults === 1 ? '' : 's'} encontrado{totalResults === 1 ? '' : 's'}.
        </p>
      )}

      <div className="logs-table-wrapper">
        {isLoading && logsData.length === 0 ? (
          <DataTable columns={columns} data={[]} isLoading skeletonRows={10} />
        ) : error ? (
          <EmptyState
            tone="error"
            title="Error al cargar los registros"
            description="Hubo un problema al consultar el historial de ejecuciones. Intenta de nuevo."
            action={{
              label: 'Reintentar',
              onClick: fetchLogs,
            }}
          />
        ) : isEmpty ? (
          <EmptyState
            icon={Search}
            title={hasActiveFilters ? 'Sin coincidencias' : 'Aún no hay registros'}
            description={hasActiveFilters
              ? 'Ningún registro coincide con la búsqueda o los filtros aplicados.'
              : 'Todavía no se han registrado ejecuciones.'}
            action={hasActiveFilters ? { label: 'Limpiar filtros', onClick: clearFilters } : undefined}
          />
        ) : (
          <>
            <DataTable
              columns={columns}
              data={logsData}
              onRowClick={(row) => navigate(`/logs/${row.execution_id}`)}
            />
            <Pagination
              page={currentPage}
              totalPages={totalPages}
              isLoading={isLoading}
              onPageChange={goToPage}
              pageSize={limit}
              onPageSizeChange={(newLimit) => updateParams({ limit: newLimit === 10 ? '' : newLimit, page: 1 })}
            />
          </>
        )}
      </div>
    </div>
  );
}
