import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Download } from 'lucide-react';
import { Button } from '@/shared/components/Button/Button';
import { DataTable } from '@/shared/components/DataTable/DataTable';
import { Badge } from '@/shared/components/Badge/Badge';
import { PageHeader } from '@/shared/components/PageHeader/PageHeader';
import { Tabs, Tab } from '@/shared/components/Tabs/Tabs';
import { statusVariant } from '@/shared/utils/statusVariant';
import { Skeleton } from '@/shared/components/Skeleton/Skeleton';
import { EmptyState } from '@/shared/components/EmptyState/EmptyState';
import { apiFetch } from '@/shared/utils/apiClient';
import './LogDetail.css';

export function LogDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const [executionData, setExecutionData] = useState(null);
  const [events, setEvents] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [approvals, setApprovals] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [activeTab, setActiveTab] = useState('events');

  const goBack = () => navigate(-1);

  const fetchDetails = useCallback(async () => {
      try {
        setIsLoading(true);
        setError(null);
        const [execRes, eventsRes] = await Promise.all([
          apiFetch(`/api/executions/${id}`),
          apiFetch(`/api/executions/${id}/events`),
        ]);

        const [execJson, eventsJson] = await Promise.all([
          execRes.json(),
          eventsRes.json(),
        ]);

        if (!execRes.ok || !execJson.success) {
          throw new Error(execJson.message || 'Error al obtener los detalles de la ejecución');
        }

        const execution = execJson.data;
        const shouldOmitRelatedDetails = execution.process_code === 'international_purchases';

        setExecutionData(execution);
        setEvents(eventsJson.data || []);

        if (shouldOmitRelatedDetails) {
          setTransactions([]);
          setApprovals([]);
          setSubjects([]);
          return;
        }

        const [transRes, approxRes, subRes] = await Promise.all([
          apiFetch(`/api/executions/${id}/transactions`),
          apiFetch(`/api/executions/${id}/approvals`),
          apiFetch(`/api/executions/${id}/subjects`),
        ]);

        const [transJson, approxJson, subJson] = await Promise.all([
          transRes.json(),
          approxRes.json(),
          subRes.json(),
        ]);

        setTransactions(transJson.data || []);
        setApprovals(approxJson.data || []);
        setSubjects(subJson.data || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
  }, [id]);

  useEffect(() => {
    fetchDetails();
  }, [fetchDetails]);

  if (!isLoading && (error || !executionData)) {
    return (
      <div className="log-detail-page">
        <PageHeader breadcrumb={[{ label: 'Registros', href: '/logs' }, { label: id }]} />
        <EmptyState
          tone="error"
          title="No se pudo cargar la ejecución"
          description={error || 'No se encontró la ejecución solicitada.'}
          action={{ label: 'Reintentar', onClick: fetchDetails }}
        />
      </div>
    );
  }

  // Mientras carga no se sabe el proceso todavía (`executionData` es null), así
  // que las dos banderas caen a `false` — el esqueleto muestra el silueta del
  // caso común (Eventos + Transacciones + Aprobaciones) y no intenta adivinar
  // si esta ejecución en particular omitirá alguna sección.
  const shouldOmitRelatedDetails = executionData?.process_code === 'international_purchases';
  const isMaterialRevaluation = executionData?.process_code === 'material_revaluation';

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString('es-MX', { timeZone: 'UTC', dateStyle: 'short', timeStyle: 'short' });
  };

  const checkNull = (val) => val === null || val === undefined || val === '' ? '-' : val;

  const formatDuration = (ms) => {
    if (!ms && ms !== 0) return '-';
    const totalSeconds = Math.floor(Number(ms) / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes > 0) {
      return `${minutes} min ${seconds} s`;
    }
    return `${seconds} s`;
  };

  const handleExportDetailCSV = () => {
    let csvContent = "";

    const escapeCsv = (field) => {
      if (field === null || field === undefined) return '""';
      let str = String(field);
      if (/^\s*[=+\-@]/.test(str)) {
        str = `'${str}`;
      }
      if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const addRow = (rowArray) => {
      csvContent += rowArray.map(escapeCsv).join(',') + '\r\n';
    };

    addRow(["INFORMACIÓN GENERAL"]);
    addRow(["ID", "Proceso", "Workflow", "Referencia", "Estado", "Fecha Creación", "Duración", "Mensaje de Error"]);
    addRow([
      executionData.execution_id,
      executionData.process_name,
      executionData.workflow_name,
      executionData.source_reference,
      executionData.display_status,
      formatDate(executionData.created_at_mx),
      formatDuration(executionData.duration_ms),
      executionData.error_message || ''
    ]);
    addRow([]);
    addRow([]);

    const addSubjectRows = () => {
      addRow(["DOCUMENTOS RELACIONADOS"]);
      addRow(["Nombre", "Tipo", "Rol", "Sistema Origen", "Fecha"]);
      subjects.forEach(s => {
        addRow([s.display_name, s.display_subject_type, s.display_subject_role, s.source_system, formatDate(s.created_at_mx)]);
      });
    };

    if (isMaterialRevaluation && !shouldOmitRelatedDetails) {
      addSubjectRows();
      addRow([]);
      addRow([]);
    }

    addRow(["EVENTOS"]);
    addRow(["Nodo", "Evento", "Tipo", "Estado", "Fecha", "Mensaje Error"]);
    events.forEach(e => {
      addRow([e.node_name, e.event_name, e.event_type, e.status, formatDate(e.created_at_mx), e.error_message]);
    });
    addRow([]);
    addRow([]);

    if (!shouldOmitRelatedDetails) {
    addRow(["TRANSACCIONES"]);
    addRow(["Operación", "Nodo", "Sistema", "Método HTTP", "Estado", "Fecha Inicio"]);
    transactions.forEach(t => {
      addRow([t.operation_name, t.node_name, t.system_name, t.http_method, t.status, formatDate(t.started_at_mx)]);
    });
    addRow([]);
    addRow([]);

    addRow(["APROBACIONES"]);
    addRow(["Nodo", "Canal", "Estado", "Solicitado A", "Fecha Respuesta"]);
    approvals.forEach(a => {
      addRow([a.node_name, a.approval_channel, a.display_approval_status || a.approval_status, a.requested_to, formatDate(a.responded_at_mx)]);
    });
    addRow([]);
    addRow([]);

    if (!isMaterialRevaluation) {
      addSubjectRows();
    }
    }

    const blob = new Blob(["﻿" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `Detalle_Ejecucion_${executionData.execution_id}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const eventsColumns = [
    { header: 'Nodo', accessor: 'node_name', cell: (row) => checkNull(row.node_name) },
    { header: 'Evento', accessor: 'event_name', cell: (row) => checkNull(row.event_name) },
    { header: 'Tipo', accessor: 'event_type', cell: (row) => checkNull(row.event_type) },
    { header: 'Estado', accessor: 'status', cell: (row) => <Badge variant={statusVariant(row.status)} size="sm">{row.status}</Badge> },
    { header: 'Fecha', accessor: 'created_at_mx', cell: (row) => formatDate(row.created_at_mx) },
    { header: 'Mensaje Error', accessor: 'error_message', cell: (row) => checkNull(row.error_message) }
  ];

  const transactionsColumns = [
    { header: 'Operación', accessor: 'operation_name', cell: (row) => checkNull(row.operation_name) },
    { header: 'Nodo', accessor: 'node_name', cell: (row) => checkNull(row.node_name) },
    { header: 'Sistema', accessor: 'system_name', cell: (row) => checkNull(row.system_name) },
    { header: 'Método HTTP', accessor: 'http_method', cell: (row) => checkNull(row.http_method) },
    { header: 'Estado', accessor: 'status', cell: (row) => <Badge variant={statusVariant(row.status)} size="sm">{row.status}</Badge> },
    { header: 'Fecha Inicio', accessor: 'started_at_mx', cell: (row) => formatDate(row.started_at_mx) }
  ];

  const approvalsColumns = [
    { header: 'Nodo', accessor: 'node_name', cell: (row) => checkNull(row.node_name) },
    { header: 'Canal', accessor: 'approval_channel', cell: (row) => checkNull(row.approval_channel) },
    { header: 'Estado', accessor: 'display_approval_status', cell: (row) => {
        const value = row.display_approval_status || row.approval_status;
        return <Badge variant={statusVariant(value)} size="sm">{value}</Badge>;
      } },
    { header: 'Solicitado A', accessor: 'requested_to', cell: (row) => checkNull(row.requested_to) },
    { header: 'Fecha Respuesta', accessor: 'responded_at_mx', cell: (row) => formatDate(row.responded_at_mx) }
  ];

  const subjectsColumns = [
    { header: 'Nombre', accessor: 'display_name', cell: (row) => checkNull(row.display_name) },
    { header: 'Tipo', accessor: 'display_subject_type', cell: (row) => checkNull(row.display_subject_type) },
    { header: 'Rol', accessor: 'display_subject_role', cell: (row) => checkNull(row.display_subject_role) },
    { header: 'Sistema Origen', accessor: 'source_system', cell: (row) => checkNull(row.source_system) },
    { header: 'Fecha', accessor: 'created_at_mx', cell: (row) => formatDate(row.created_at_mx) }
  ];

  // Mismo orden y condiciones que antes de pasar a pestañas: Documentos Relacionados
  // va primero solo para revaluaciones (isMaterialRevaluation) y al final para el
  // resto de procesos; Transacciones/Aprobaciones se omiten para compras
  // internacionales (shouldOmitRelatedDetails). Durante la carga ambas banderas
  // caen a `false`, así que se ve el caso común (Eventos + Transacciones +
  // Aprobaciones) — igual que hacía el esqueleto anterior.
  const subjectsTab = {
    id: 'subjects',
    label: 'Documentos Relacionados',
    count: subjects.length,
    columns: subjectsColumns,
    data: subjects,
  };
  const sections = [];
  if (isMaterialRevaluation && !shouldOmitRelatedDetails) sections.push(subjectsTab);
  sections.push({ id: 'events', label: 'Eventos', count: events.length, columns: eventsColumns, data: events });
  if (!shouldOmitRelatedDetails) {
    sections.push({ id: 'transactions', label: 'Transacciones', count: transactions.length, columns: transactionsColumns, data: transactions });
    sections.push({ id: 'approvals', label: 'Aprobaciones', count: approvals.length, columns: approvalsColumns, data: approvals });
    if (!isMaterialRevaluation) sections.push(subjectsTab);
  }
  const activeSection = sections.find((section) => section.id === activeTab) || sections[0];

  return (
    <div className="log-detail-page">
      <PageHeader breadcrumb={[{ label: 'Registros', href: '/logs' }, { label: id }]} />

      <div className="log-detail-card">
        <div className="detail-card-header">
          <div>
            <h1 className="detail-title">Detalle de Ejecución</h1>
            <p className="detail-subtitle">
              {isLoading ? <Skeleton width={140} /> : `ID: ${executionData.execution_id}`}
            </p>
          </div>
          {isLoading ? (
            <Skeleton width={90} height={24} borderRadius="var(--radius-full)" />
          ) : (
            <Badge variant={statusVariant(executionData.display_status)}>
              {executionData.display_status}
            </Badge>
          )}
        </div>

        <div className="detail-body">
          <div className="detail-metadata">
            <div className="metadata-group">
              <span className="metadata-label">Proceso</span>
              <span className="metadata-value">{isLoading ? <Skeleton width="70%" /> : checkNull(executionData.process_name)}</span>
            </div>
            <div className="metadata-group">
              <span className="metadata-label">Workflow</span>
              <span className="metadata-value">{isLoading ? <Skeleton width="70%" /> : checkNull(executionData.workflow_name)}</span>
            </div>
            <div className="metadata-group">
              <span className="metadata-label">Referencia Origen</span>
              <span className="metadata-value">{isLoading ? <Skeleton width="70%" /> : checkNull(executionData.source_reference)}</span>
            </div>
            <div className="metadata-group">
              <span className="metadata-label">Fecha Creación</span>
              <span className="metadata-value">{isLoading ? <Skeleton width="70%" /> : formatDate(executionData.created_at_mx)}</span>
            </div>
            <div className="metadata-group">
              <span className="metadata-label">Duración</span>
              <span className="metadata-value">{isLoading ? <Skeleton width="70%" /> : formatDuration(executionData.duration_ms)}</span>
            </div>
            {!isLoading && executionData.error_message && (
              <div className="metadata-group" style={{ gridColumn: '1 / -1', marginTop: '1rem' }}>
                {/* Token en vez del literal #dc2626 que traía: ese rojo fijo no se
                    redeclara en tema oscuro y bajaba a 3.46:1 de contraste (falla
                    AA); var(--color-error) sí tiene su propia variante oscura. */}
                <span className="metadata-label" style={{ color: 'var(--color-error)' }}>Mensaje de Error General</span>
                <span className="metadata-value" style={{ color: 'var(--color-error)' }}>{executionData.error_message}</span>
              </div>
            )}
          </div>

          <div className="detail-section">
            <Tabs value={activeSection?.id} onChange={setActiveTab} ariaLabel="Secciones del detalle">
              {sections.map((section) => (
                <Tab
                  key={section.id}
                  value={section.id}
                  label={section.label}
                  badge={!isLoading ? section.count : undefined}
                />
              ))}
            </Tabs>
            {activeSection && (
              <div className="table-wrapper">
                <DataTable columns={activeSection.columns} data={activeSection.data} isLoading={isLoading} />
              </div>
            )}
          </div>
        </div>

        <div className="detail-footer">
          <Button variant="ghost" onClick={goBack}>Volver</Button>
          <div className="footer-actions">
            <Button variant="secondary" onClick={handleExportDetailCSV} disabled={isLoading}>
              <Download size={16} />
              Exportar Detalle (CSV)
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
