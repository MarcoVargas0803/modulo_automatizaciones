import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { AlertOctagon, Plus, RefreshCw, Ship, Inbox } from 'lucide-react';

import { DataTable } from '@/shared/components/DataTable/DataTable';
import { Badge } from '@/shared/components/Badge/Badge';
import { Button } from '@/shared/components/Button/Button';
import { Pagination } from '@/shared/components/Pagination/Pagination';
import { FilterBar } from '@/shared/components/FilterBar/FilterBar';
import {
  FilterDateField,
  FilterSelectField,
} from '@/shared/components/FilterBar/FilterFields';
import { ShipmentFormModal } from '@/modules/international-purchases/components/ShipmentFormModal/ShipmentFormModal';
import { ShipmentDetailsModal } from '@/modules/international-purchases/components/ShipmentDetailsModal/ShipmentDetailsModal';
import { ConfirmDeleteModal } from '@/shared/components/ConfirmDeleteModal/ConfirmDeleteModal';
import { PageHeader } from '@/shared/components/PageHeader/PageHeader';
import { useToast } from '@/shared/components/Toast/useToast';
import { EmptyState } from '@/shared/components/EmptyState/EmptyState';
import { Hint } from '@/shared/components/Hint/Hint';
import { ProcessGuard } from '@/shared/components/ProcessGuard/ProcessGuard';

import { apiFetch } from '@/shared/utils/apiClient';
import { formatDate, formatDateTime, formatRelativeTime, trackingErrorText } from '@/shared/utils/formatters';
import { shipmentStatusVariant } from '@/modules/international-purchases/utils/shipmentStatus';
import { WARNING_SEVERITY_ICON, warningSeverity } from '@/modules/international-purchases/utils/shipmentWarnings';

import './InternationalPurchases.css';

const initialForm = {
  tracking_key: '',
  tracking_reference_type: 'MBL',
  tracking_provider_type: 'NAVIERA',
  tracking_provider_name: '',
  scac: '',
  portal_notes: '',
  proveedor: '',
  factura_codigo: '',
  agencia: '',
  material: '',
  contenedores_bl: '',
  custom_fields: [],
};

const initialFilters = {
  search: '',
  status: '',
  providerType: '',
  eta: '',
  reviewStatus: '',
};

const TRACKING_POLL_INTERVAL_MS = 4000;
const TRACKING_POLL_MAX_MS = 120000;
const INTERNATIONAL_PURCHASES_PROCESS = 'international_purchases';

// Pausa antes de que la búsqueda viaje a la URL. Mismo valor que Logs, que es
// de donde sale el patrón: la búsqueda ya no espera a «Aplicar».
const SEARCH_DEBOUNCE_MS = 250;

// Etiquetas legibles para los chips. Los valores crudos son los que entiende el
// backend (`ALLOWED_REVIEW_STATUSES` y el CHECK de la tabla); estas etiquetas
// son solo presentación y no deben usarse como valor.
const PROVIDER_TYPE_LABELS = {
  NAVIERA: 'Naviera',
  FORWARDER: 'Forwarder',
};

const REVIEW_STATUS_LABELS = {
  PENDING_REVIEW: 'Sin revisar',
  REVIEWED: 'Revisados',
  DISCARDED: 'Descartados',
};

function readFiltersFromParams(params) {
  return {
    search: params.get('search') || '',
    status: params.get('status') || '',
    providerType: params.get('providerType') || '',
    eta: params.get('eta') || '',
    reviewStatus: params.get('reviewStatus') || '',
  };
}

function InternationalPurchasesContent() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const appliedFilters = useMemo(() => readFiltersFromParams(searchParams), [searchParams]);
  const page = Math.max(parseInt(searchParams.get('page'), 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit'), 10) || 25, 1), 100);
  const effectiveSortBy = searchParams.get('sortBy') || 'updated_at';
  const effectiveSortDir = searchParams.get('sortDir') || 'desc';
  const hasActiveFilters = useMemo(
    () => Object.values(appliedFilters).some(Boolean),
    [appliedFilters],
  );

  const updateParams = useCallback((patch) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [key, value] of Object.entries(patch)) {
        if (value === '' || value == null) {
          next.delete(key);
        } else {
          next.set(key, String(value));
        }
      }
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const [shipments, setShipments] = useState([]);
  const [pagination, setPagination] = useState({
    total: 0,
    totalPages: 1,
  });

  // Dos estados y no uno, igual que en Logs.jsx: la búsqueda es VIVA —se
  // sincroniza sola con la URL tras una pausa— y el resto de filtros son un
  // BORRADOR que no se aplica hasta pulsar «Aplicar». Mezclarlos hacía que
  // resincronizar el borrador pisara lo que el usuario estaba tecleando.
  const [searchTerm, setSearchTerm] = useState(() => searchParams.get('search') || '');
  const [draftFilters, setDraftFilters] = useState(() => readFiltersFromParams(searchParams));

  const [form, setForm] = useState(initialForm);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingShipmentId, setEditingShipmentId] = useState(null);
  const [editingShipment, setEditingShipment] = useState(null);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [warningCatalog, setWarningCatalog] = useState([]);

  const [selectedShipment, setSelectedShipment] = useState(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const [isBackgroundRefreshing, setIsBackgroundRefreshing] = useState(false);
  const trackingPollTimer = useRef(null);
  const toast = useToast();

  useEffect(() => () => {
    if (trackingPollTimer.current) clearTimeout(trackingPollTimer.current);
  }, []);

  const buildQueryParams = useCallback(() => {
    const params = new URLSearchParams();

    params.set('page', String(page));
    params.set('limit', String(limit));
    params.set('sortBy', effectiveSortBy);
    params.set('sortDir', effectiveSortDir);

    if (appliedFilters.search) params.set('search', appliedFilters.search);
    if (appliedFilters.status) params.set('status', appliedFilters.status);
    if (appliedFilters.providerType) params.set('providerType', appliedFilters.providerType);
    if (appliedFilters.eta) params.set('eta', appliedFilters.eta);
    if (appliedFilters.reviewStatus) params.set('reviewStatus', appliedFilters.reviewStatus);

    return params;
  }, [appliedFilters, limit, page, effectiveSortBy, effectiveSortDir]);

  const fetchShipments = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) {
        setIsLoading(true);
        setError(false);
      }

      const params = buildQueryParams();
      const response = await apiFetch(`/api/international-purchases/shipments?${params.toString()}`);
      const json = await response.json();

      if (response.status === 403) {
        toast.error('Ya no tienes acceso a este módulo.');
        navigate('/dashboard', { replace: true });
        return undefined;
      }

      if (!response.ok || !json.success) {
        throw new Error(json.message || 'Error al consultar embarques');
      }

      const data = json.data || [];
      setShipments(data);
      setPagination((current) => ({
        ...current,
        total: json.pagination?.total || 0,
        totalPages: json.pagination?.totalPages || 1,
      }));
      return data;
    } catch (err) {
      if (!silent) {
        setError(true);
        toast.error(err.message, { duration: 0 });
      }
      return undefined;
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, [buildQueryParams]);

  useEffect(() => {
    fetchShipments();
  }, [fetchShipments]);

  useEffect(() => {
    let active = true;

    apiFetch('/api/international-purchases/warning-catalog')
      .then((response) => (response.ok ? response.json() : null))
      .then((json) => {
        if (active && json?.success) {
          setWarningCatalog(json.data || []);
        }
      })
      // Sin catálogo, las advertencias salen como códigos crudos y en azul
      // informativo: la tabla se ve bien pero miente sobre la gravedad. El fallo
      // se tragaba entero, así que nadie se enteraba. No es bloqueante —la
      // página sirve igual—, por eso avisa en vez de romper.
      .catch(() => {
        if (active) {
          toast.error('No se pudo cargar el catálogo de advertencias. Se mostrarán los códigos sin descripción.');
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const warningCatalogMap = useMemo(() => {
    const map = {};
    for (const warning of warningCatalog) {
      map[warning.code] = warning;
    }
    return map;
  }, [warningCatalog]);


  // Búsqueda viva. El borrador ya no se resincroniza en bloque desde la URL:
  // eso lo hace `onOpen` de FilterBar solo al abrir el panel, que es cuando
  // tiene sentido y sin pisar una edición en curso.
  useEffect(() => {
    const handle = setTimeout(() => {
      const trimmed = searchTerm.trim();

      if (trimmed !== appliedFilters.search) {
        updateParams({ search: trimmed, page: 1 });
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(handle);
  }, [searchTerm, appliedFilters.search, updateParams]);

  // `search` no entra aquí: ya viaja sola. Y `reviewStatus` sí, porque ahora es
  // un filtro más del panel además del atajo de la cabecera.
  const handleApplyFilters = () => {
    updateParams({
      status: draftFilters.status,
      providerType: draftFilters.providerType,
      eta: draftFilters.eta,
      reviewStatus: draftFilters.reviewStatus,
      page: 1,
    });
  };

  const handleClearFilters = () => {
    setDraftFilters(initialFilters);
    setSearchTerm('');
    updateParams({
      search: '',
      status: '',
      providerType: '',
      eta: '',
      // Faltaba. Como `hasActiveFilters` sí cuenta reviewStatus, el EmptyState
      // ofrecía «Limpiar filtros» y al pulsarlo el listado seguía filtrado por
      // «Sin revisar»: la pantalla decía que no había filtros y los había.
      reviewStatus: '',
      page: 1,
    });
  };

  // Un chip por filtro vigente. Se derivan de la URL —no del borrador— porque
  // representan lo que se está aplicando, no lo que se está editando.
  const filterChips = useMemo(() => {
    const chips = [];

    if (appliedFilters.search) {
      chips.push({
        key: 'search',
        label: `Búsqueda: ${appliedFilters.search}`,
        // Hay que limpiar también el estado local: la caja de búsqueda no se
        // resincroniza desde la URL (mismo comportamiento que Logs).
        onRemove: () => {
          setSearchTerm('');
          updateParams({ search: '', page: 1 });
        },
      });
    }

    if (appliedFilters.status) {
      chips.push({
        key: 'status',
        label: `Estatus: ${appliedFilters.status}`,
        onRemove: () => updateParams({ status: '', page: 1 }),
      });
    }

    if (appliedFilters.providerType) {
      chips.push({
        key: 'providerType',
        label: `Proveedor: ${PROVIDER_TYPE_LABELS[appliedFilters.providerType] || appliedFilters.providerType}`,
        onRemove: () => updateParams({ providerType: '', page: 1 }),
      });
    }

    if (appliedFilters.eta) {
      chips.push({
        key: 'eta',
        label: `ETA: ${formatDate(appliedFilters.eta)}`,
        onRemove: () => updateParams({ eta: '', page: 1 }),
      });
    }

    if (appliedFilters.reviewStatus) {
      chips.push({
        key: 'reviewStatus',
        label: `Revisión: ${REVIEW_STATUS_LABELS[appliedFilters.reviewStatus] || appliedFilters.reviewStatus}`,
        // Quitar este chip desactiva el botón «Sin revisar» de la cabecera sin
        // lógica extra: los dos escriben el mismo parámetro de la URL, así que
        // no pueden divergir.
        onRemove: () => updateParams({ reviewStatus: '', page: 1 }),
      });
    }

    return chips;
  }, [appliedFilters, updateParams]);

  const handleSort = (key) => {
    const nextDir = effectiveSortBy === key && effectiveSortDir === 'asc' ? 'desc' : 'asc';
    updateParams({ sortBy: key, sortDir: nextDir, page: 1 });
  };

  const handleFormChange = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const openCreateForm = () => {
    setForm(initialForm);
    setEditingShipmentId(null);
    setEditingShipment(null);
    setSelectedShipment(null);
    setIsFormOpen(true);
  };

  const openEditForm = (shipment) => {
    setForm({
      tracking_key: shipment.tracking_key || '',
      tracking_reference_type: shipment.tracking_reference_type || 'MBL',
      tracking_provider_type: shipment.tracking_provider_type || 'NAVIERA',
      tracking_provider_name: shipment.tracking_provider_name || '',
      scac: shipment.scac || '',
      portal_notes: shipment.portal_notes || '',
      proveedor: shipment.supplier_name || '',
      factura_codigo: shipment.invoice_code || '',
      agencia: shipment.agency || '',
      material: shipment.material_description || '',
      contenedores_bl: shipment.container_count == null ? '' : String(shipment.container_count),
      custom_fields: Array.isArray(shipment.custom_fields) ? shipment.custom_fields : [],
    });
    setEditingShipmentId(shipment.shipment_id);
    setEditingShipment(shipment);
    setIsDetailsModalOpen(false);
    setIsFormOpen(true);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    try {
      setIsSaving(true);

      const payload = {
        tracking_key: form.tracking_key,
        tracking_reference_type: form.tracking_reference_type,
        tracking_provider_type: form.tracking_provider_type,
        tracking_provider_name: form.tracking_provider_name,
        scac: form.scac,
        supplier_name: form.proveedor,
        invoice_code: form.factura_codigo,
        agency: form.agencia,
        material_description: form.material,
        container_count: form.contenedores_bl,
        portal_notes: form.portal_notes,
        custom_fields: (form.custom_fields || []).filter((field) => field.label && field.label.trim()),
      };

      const url = editingShipmentId
        ? `/api/international-purchases/shipments/${editingShipmentId}`
        : '/api/international-purchases/shipments';

      const response = await apiFetch(url, {
        method: editingShipmentId ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
      });

      const json = await response.json();

      if (response.status === 403) {
        toast.error('Ya no tienes acceso a este módulo.');
        navigate('/dashboard', { replace: true });
        return;
      }

      if (!response.ok || !json.success) {
        const validationMessage = Array.isArray(json.errors) ? json.errors.join(' ') : null;
        throw new Error(validationMessage || json.message || 'Error al guardar el embarque');
      }

      // Al corregir la referencia el backend devuelve un mensaje largo (historial
      // descartado + rastreo solicitado); los 5 s por defecto no alcanzan para leerlo.
      toast.success(
        json.message || 'Embarque guardado correctamente.',
        json.referenceChanged ? { duration: 9000 } : undefined,
      );
      setForm(initialForm);
      setIsFormOpen(false);
      setEditingShipmentId(null);
      setEditingShipment(null);
      setSelectedShipment(null);

      if (!editingShipmentId) {
        updateParams({ page: 1 });
      }

      await fetchShipments();
    } catch (err) {
      toast.error(err.message, { duration: 0 });
    } finally {
      setIsSaving(false);
    }
  };

  const requestDelete = (shipment) => {
    setIsDetailsModalOpen(false);
    setDeleteTarget(shipment);
  };

  // Cierra el ciclo de revision de un embarque que registro un forwarder. No
  // es una compuerta: el embarque ya existe y su rastreo lleva corriendo desde
  // el alta, esto solo deja constancia de que un operador lo miro.
  const handleReview = async (shipment, decision) => {
    setIsReviewing(true);

    try {
      const response = await apiFetch(
        `/api/international-purchases/shipments/${shipment.shipment_id}/review`,
        { method: 'POST', body: JSON.stringify({ decision }) },
      );
      const json = await response.json();

      if (!response.ok || !json?.success) {
        toast.error(json?.message || 'No se pudo actualizar la revisión.', { duration: 0 });
        return;
      }

      toast.success(json.message);
      setIsDetailsModalOpen(false);
      setSelectedShipment(null);
      fetchShipments();
    } catch {
      toast.error('No se pudo contactar con el servidor.', { duration: 0 });
    } finally {
      setIsReviewing(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;

    try {
      setIsSaving(true);

      const response = await apiFetch(`/api/international-purchases/shipments/${deleteTarget.shipment_id}`, {
        method: 'DELETE',
      });
      const json = await response.json();

      if (response.status === 403) {
        toast.error('Ya no tienes acceso a este módulo.');
        navigate('/dashboard', { replace: true });
        return;
      }

      if (!response.ok || !json.success) {
        throw new Error(json.message || 'Error al borrar el embarque');
      }

      toast.success(json.message || 'Embarque eliminado correctamente.');
      setDeleteTarget(null);
      setSelectedShipment(null);

      await fetchShipments();
    } catch (err) {
      toast.error(err.message, { duration: 0 });
    } finally {
      setIsSaving(false);
    }
  };

  const startTrackingPoll = () => {
    if (trackingPollTimer.current) clearTimeout(trackingPollTimer.current);
    setIsBackgroundRefreshing(true);

    const startedAt = Date.now();
    let prevSignature = null;
    let stableReads = 0;

    const tick = async () => {
      const data = await fetchShipments({ silent: true });

      if (Array.isArray(data)) {
        const signature = data
          .map((s) => `${s.shipment_id}:${s.updated_at}:${s.last_tracking_error_at || ''}`)
          .join('|');

        if (signature === prevSignature) {
          stableReads += 1;
        } else {
          stableReads = 0;
          prevSignature = signature;
        }
      }

      const settled = prevSignature !== null && stableReads >= 2;
      const timedOut = Date.now() - startedAt > TRACKING_POLL_MAX_MS;

      if (settled || timedOut) {
        trackingPollTimer.current = null;
        setIsBackgroundRefreshing(false);
        if (settled) {
          toast.success('Embarques actualizados correctamente.');
        } else {
          toast.info('La actualización sigue en proceso. Vuelve a consultar en unos minutos.');
        }
        return;
      }

      trackingPollTimer.current = setTimeout(tick, TRACKING_POLL_INTERVAL_MS);
    };

    trackingPollTimer.current = setTimeout(tick, TRACKING_POLL_INTERVAL_MS);
  };

  const handleRefreshTracking = async () => {
    try {
      setIsRefreshing(true);

      const response = await apiFetch('/api/international-purchases/shipments/refresh-tracking', {
        method: 'POST',
        body: JSON.stringify({ filters: appliedFilters }),
      });
      const json = await response.json();

      if (response.status === 403) {
        window.location.replace('/dashboard');
        return;
      }

      if (!response.ok || !json.success) {
        throw new Error(json.message || 'Error al iniciar la actualización');
      }

      toast.info(json.message || 'Actualización en curso. Los embarques se refrescarán en unos momentos.');
      startTrackingPoll();
    } catch (err) {
      toast.error(err.message, { duration: 0 });
    } finally {
      setIsRefreshing(false);
    }
  };

  const columns = useMemo(() => [
    {
      header: (
        <>
          ID
          <Hint text="Identificador interno único del embarque (primeros 8 caracteres del UUID)" position="bottom" />
        </>
      ),
      accessor: 'shipment_id',
      cell: (row) => (
        <span className="muted-text" style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>
          {row.shipment_id ? row.shipment_id.slice(0, 8).toUpperCase() : '-'}
        </span>
      ),
    },
    {
      header: (
        <>
          Referencia
          <Hint text="Master Bill of Lading (MBL) del embarque" position="bottom" />
        </>
      ),
      accessor: 'tracking_key',
      sortable: true,
      sortLabel: 'Referencia',
      cell: (row) => (
        <div>
          <strong>{row.tracking_key}</strong>
          {/* Solo el alta externa nace PENDING_REVIEW. Lo que captura el
              operador ya nace revisado, asi que no se distingue nada. */}
          {row.review_status === 'PENDING_REVIEW' && (
            <Badge variant="warning" size="sm" className="shipment-review-badge">
              Sin revisar
            </Badge>
          )}
          {/* La fila descartada además se atenúa, pero el Badge es quien lo dice
              con palabras: atenuar es una señal de contraste que no todo el
              mundo percibe, y sola no comunica nada. */}
          {row.review_status === 'DISCARDED' && (
            <Badge variant="error" size="sm" className="shipment-review-badge">
              Descartado
            </Badge>
          )}
          <div className="muted-text">
            {row.tracking_reference_type || row.primary_reference_type || '-'}
            {row.shipment_type ? ` · ${row.shipment_type}` : ''}
          </div>
        </div>
      ),
    },
    {
      header: (
        <>
          Proveedor
        </>
      ),
      accessor: 'supplier_name',
      sortable: true,
      sortLabel: 'Proveedor',
      cell: (row) => row.supplier_name || '-'
    },
    {
      header: (
        <>
          Factura
        </>
      ),
      accessor: 'invoice_code',
      sortable: true,
      sortLabel: 'Factura',
      cell: (row) => row.invoice_code || '-'
    },
    {
      header: (
        <>
          Contenedores
          <Hint text="Cantidad total de contenedores registrados" position="bottom" />
        </>
      ),
      accessor: 'container_count',
      sortable: true,
      sortLabel: 'Contenedores',
      cell: (row) => (row.container_count == null ? '-' : row.container_count)
    },
    {
      header: (
        <>
          Naviera / Forwarder
        </>
      ),
      accessor: 'tracking_provider_name',
      cell: (row) => (
        <div>
          <strong>{row.tracking_provider_name || '-'}</strong>
          <div className="muted-text">{row.tracking_provider_type || '-'}</div>
        </div>
      ),
    },
    {
      header: (
        <>
          SCAC
          <Hint text="Código SCAC (Standard Carrier Alpha Code) de la naviera" position="bottom" />
        </>
      ),
      accessor: 'scac',
      sortable: true,
      sortLabel: 'SCAC',
      cell: (row) => row.scac || '-'
    },
    {
      header: (
        <>
          Estatus
          <Hint text="PLANNED: Planeado, IN_TRANSIT: En tránsito, DELIVERED: Entregado, UNKNOWN: Desconocido" position="bottom" />
        </>
      ),
      accessor: 'shipment_status',
      sortable: true,
      sortLabel: 'Estatus',
      cell: (row) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', alignItems: 'flex-start' }}>
          <Badge variant={shipmentStatusVariant(row.shipment_status)} size="sm">
            {row.shipment_status}
          </Badge>
          {/* Un fallo de rastreo es un error, y hasta ahora se pintaba de azul:
              se resolvía con un catálogo sintético que no traía `severity`, así
              que la lista blanca lo degradaba a informativo. Aquí la gravedad
              es explícita. */}
          {row.last_tracking_error && (
            <Badge
              variant="error"
              size="sm"
              icon={AlertOctagon}
              hint={trackingErrorText(row.last_tracking_error)}
            >
              Sin tracking
            </Badge>
          )}
        </div>
      ),
    },
    {
      header: (
        <>
          ETA
          <Hint text="Fecha estimada de arribo (Estimated Time of Arrival)" position="bottom" />
        </>
      ),
      accessor: 'eta',
      sortable: true,
      sortLabel: 'ETA',
      cell: (row) => <strong>{formatDate(row.eta)}</strong>
    },
    {
      header: (
        <>
          ETD
          <Hint text="Fecha estimada de salida (Estimated Time of Departure)" position="bottom" />
        </>
      ),
      accessor: 'etd',
      sortable: true,
      sortLabel: 'ETD',
      cell: (row) => formatDate(row.etd)
    },
    {
      header: (
        <>
          ATA
          <Hint text="Fecha real de arribo (Actual Time of Arrival)" position="bottom" />
        </>
      ),
      accessor: 'ata',
      sortable: true,
      sortLabel: 'ATA',
      cell: (row) => formatDate(row.ata)
    },
    {
      header: (
        <>
          ATD
          <Hint text="Fecha real de salida (Actual Time of Departure)" position="bottom" />
        </>
      ),
      accessor: 'atd',
      sortable: true,
      sortLabel: 'ATD',
      cell: (row) => formatDate(row.atd)
    },
    {
      header: (
        <>
          Terminal
          <Hint text="Terminal portuaria de destino" position="bottom" />
        </>
      ),
      accessor: 'terminal',
      sortable: true,
      sortLabel: 'Terminal',
      cell: (row) => row.terminal || '-'
    },
    {
      header: (
        <>
          Advertencias
          <Hint text="Indicadores o advertencias encontradas durante la auditoría del embarque" position="bottom" />
        </>
      ),
      accessor: 'warnings',
      cell: (row) => {
        const codes = Array.isArray(row.warnings) ? row.warnings : [];

        if (codes.length === 0) return <span className="muted-text">-</span>;

        return (
          // La fila es `role="button"` y abre la ficha: sin frenar aquí el
          // evento, consultar una advertencia abriría el tooltip y el modal
          // encima, en el mismo gesto.
          <div
            className="shipment-warnings"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            {codes.map((code) => {
              const entry = warningCatalogMap[code];
              const severity = warningSeverity(entry);

              return (
                <Badge
                  key={code}
                  variant={severity}
                  size="sm"
                  icon={WARNING_SEVERITY_ICON[severity]}
                  hint={entry?.label_es || code}
                >
                  {code}
                </Badge>
              );
            })}
          </div>
        );
      },
    },
    {
      header: (
        <>
          Última actualización
          <Hint text="Fecha y hora del último rastreo o cambio de estado registrado por n8n" position="bottom" />
        </>
      ),
      accessor: 'updated_at',
      sortable: true,
      sortLabel: 'Última actualización',
      cell: (row) => (
        <span title={formatDateTime(row.updated_at)}>{formatRelativeTime(row.updated_at)}</span>
      )
    },
  ], [warningCatalogMap]);

  return (
    <div className="international-purchases-page">
      <PageHeader
        title="Compras Internacionales"
        subtitle="Seguimiento de MBL registrados desde el módulo de reportes."
        actions={
          <>
            <Button variant="secondary" onClick={handleRefreshTracking} disabled={isRefreshing}
              leftIcon={<RefreshCw size={16} aria-hidden="true" />}
            >
              {isRefreshing ? 'Iniciando…' : 'Actualizar'}
            </Button>
            <Button variant="primary" onClick={openCreateForm}
              leftIcon={<Plus size={16} aria-hidden="true" />}
            >
              Nuevo embarque
            </Button>
          </>
        }
      />

      <ShipmentFormModal
        isOpen={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setEditingShipmentId(null);
          setEditingShipment(null);
          if (selectedShipment) setIsDetailsModalOpen(true);
        }}
        onSubmit={handleSubmit}
        form={form}
        onChange={handleFormChange}
        isSaving={isSaving}
        editingShipmentId={editingShipmentId}
        editingShipment={editingShipment}
      />

      {error && !isLoading ? (
        <div style={{ padding: '24px 0' }}>
          <EmptyState
            tone="error"
            title="Error al cargar los embarques"
            description="Hubo un problema al consultar la bandeja de compras internacionales."
            action={{
              label: 'Reintentar',
              onClick: () => fetchShipments(),
            }}
          />
        </div>
      ) : (
        <>
          <FilterBar
            searchValue={searchTerm}
            onSearchChange={setSearchTerm}
            searchPlaceholder="BL, SCAC, naviera, terminal, factura…"
            searchAriaLabel="Buscar embarques"
            panelAriaLabel="Filtros de embarques"
            hasActiveFilters={hasActiveFilters}
            onOpen={() => setDraftFilters(appliedFilters)}
            onApply={handleApplyFilters}
            onClear={handleClearFilters}
            chips={filterChips}
            onClearAll={handleClearFilters}
          >
            <FilterDateField
              label="ETA (llegada estimada)"
              id="shipments-eta"
              value={draftFilters.eta}
              onChange={(value) => setDraftFilters({ ...draftFilters, eta: value })}
            />
            <FilterSelectField
              label="Proveedor"
              id="shipments-provider-type"
              value={draftFilters.providerType}
              onChange={(value) => setDraftFilters({ ...draftFilters, providerType: value })}
            >
              <option value="">Todos los proveedores</option>
              <option value="NAVIERA">Naviera</option>
              <option value="FORWARDER">Forwarder</option>
            </FilterSelectField>
            <FilterSelectField
              label="Estatus"
              id="shipments-status"
              value={draftFilters.status}
              onChange={(value) => setDraftFilters({ ...draftFilters, status: value })}
            >
              <option value="">Todos los estatus</option>
              <option value="PLANNED">PLANNED</option>
              <option value="IN_TRANSIT">IN_TRANSIT</option>
              <option value="DELIVERED">DELIVERED</option>
              <option value="UNKNOWN">UNKNOWN</option>
            </FilterSelectField>
            {/* Única forma de volver a ver un embarque descartado. El backend ya
                lo soportaba —`reviewStatus` acepta DISCARDED y el listado solo
                los oculta cuando no se piden—; lo que faltaba era pedirlo. */}
            <FilterSelectField
              label="Revisión"
              id="shipments-review-status"
              value={draftFilters.reviewStatus}
              onChange={(value) => setDraftFilters({ ...draftFilters, reviewStatus: value })}
            >
              <option value="">Todos menos descartados</option>
              <option value="PENDING_REVIEW">Sin revisar</option>
              <option value="REVIEWED">Revisados</option>
              <option value="DISCARDED">Descartados</option>
            </FilterSelectField>
          </FilterBar>

          <section className="shipments-section">
            <div className="section-header">
              <div>
                <h2 className="section-title">
                  Embarques registrados
                  {(isBackgroundRefreshing || (isLoading && shipments.length > 0)) && (
                    <span className="refreshing-hint">
                      <RefreshCw size={13} className="refreshing-hint-icon" aria-hidden="true" />
                      Actualizando…
                    </span>
                  )}
                </h2>
                {/* La segunda frase sustituye a la columna «Detalles»: la fila
                    ya es pulsable, pero el cursor y el hover son la unica
                    pista y no todo el mundo los percibe. */}
                <p className="section-subtitle">
                  {pagination.total} registro{pagination.total === 1 ? '' : 's'} encontrado{pagination.total === 1 ? '' : 's'}.
                  {' '}Selecciona una fila para ver el detalle.
                </p>
              </div>

              {/* Atajo, no un filtro mas de la barra: revisar lo que registran
                  los forwarders es la tarea diaria del operador y merece estar
                  a un clic. Alterna, para poder volver al listado completo. */}
              <Button
                variant={appliedFilters.reviewStatus === 'PENDING_REVIEW' ? 'primary' : 'secondary'}
                onClick={() => updateParams({
                  reviewStatus: appliedFilters.reviewStatus === 'PENDING_REVIEW' ? '' : 'PENDING_REVIEW',
                  page: 1,
                })}
                leftIcon={<Inbox size={16} aria-hidden="true" />}
              >
                {appliedFilters.reviewStatus === 'PENDING_REVIEW' ? 'Ver todos' : 'Sin revisar'}
              </Button>
            </div>

            <div className={`shipments-table-wrapper ${isLoading && shipments.length > 0 ? 'is-refreshing' : ''}`}>
              {!isLoading && shipments.length === 0 ? (
                <EmptyState
                  icon={Ship}
                  title={hasActiveFilters ? 'Sin coincidencias' : 'Aún no hay embarques'}
                  description={hasActiveFilters
                    ? 'Ningún embarque coincide con los filtros aplicados.'
                    : 'Registra tu primer embarque para comenzar el seguimiento.'}
                  action={hasActiveFilters
                    ? { label: 'Limpiar filtros', onClick: handleClearFilters }
                    : { label: 'Nuevo embarque', onClick: openCreateForm, variant: 'primary' }}
                />
              ) : (
                <>
                  <DataTable
                    columns={columns}
                    data={shipments}
                    density="compact"
                    rowClassName={(row) => (row.review_status === 'DISCARDED'
                      ? 'shipment-row--discarded'
                      : '')}
                    isLoading={isLoading && shipments.length === 0}
                    sortBy={effectiveSortBy}
                    sortDir={effectiveSortDir}
                    onSort={handleSort}
                    // Abre la ficha en vez de navegar: no hay ruta de detalle
                    // para un embarque. Es seguro porque ninguna celda de esta
                    // tabla contiene botones —la de «Detalles» era la unica y
                    // se retiro—, y DataTable no detiene la propagacion.
                    onRowClick={(row) => {
                      setSelectedShipment(row);
                      setIsDetailsModalOpen(true);
                    }}
                  />
                  {shipments.length > 0 && (
                    <Pagination
                      page={page}
                      totalPages={pagination.totalPages}
                      isLoading={isLoading}
                      onPageChange={(newPage) => updateParams({ page: newPage })}
                      pageSize={limit}
                      onPageSizeChange={(newLimit) => updateParams({ limit: newLimit, page: 1 })}
                    />
                  )}
                </>
              )}
            </div>
          </section>
        </>
      )}

      <ShipmentDetailsModal
        isOpen={isDetailsModalOpen}
        onClose={() => setIsDetailsModalOpen(false)}
        shipment={selectedShipment}
        warningCatalogMap={warningCatalogMap}
        onDeleteRequest={requestDelete}
        onEditRequest={openEditForm}
        onReviewRequest={handleReview}
        isReviewing={isReviewing}
      />

      <ConfirmDeleteModal
        isOpen={Boolean(deleteTarget)}
        onClose={() => {
          setDeleteTarget(null);
          if (selectedShipment) setIsDetailsModalOpen(true);
        }}
        onConfirm={confirmDelete}
        trackingKey={deleteTarget?.tracking_key}
        isSaving={isSaving}
      />
    </div>
  );
}

/**
 * InternationalPurchases — Bandeja de embarques del módulo.
 *
 * Los enlaces de registro para forwarders vivían aquí en una pestaña; ahora son
 * una subsección propia (`ShipmentInvites`, `/international-purchases/enlaces`).
 *
 * Solo aplica el gate de proceso; el contenido vive en
 * `InternationalPurchasesContent` y no se monta hasta confirmarlo. Hasta ahora
 * esta página **no comprobaba el proceso en absoluto**: se montaba entera,
 * lanzaba sus peticiones y solo reaccionaba al 403 después, mandando al usuario
 * a `/dashboard` con un toast. Ese camino sigue ahí, pero pasa a ser lo que
 * siempre debió ser —la red para cuando el acceso se retira con la página
 * abierta— en vez del control de acceso.
 */
export function InternationalPurchases() {
  return (
    <ProcessGuard
      processCode={INTERNATIONAL_PURCHASES_PROCESS}
      moduleName="Compras Internacionales"
    >
      <InternationalPurchasesContent />
    </ProcessGuard>
  );
}
