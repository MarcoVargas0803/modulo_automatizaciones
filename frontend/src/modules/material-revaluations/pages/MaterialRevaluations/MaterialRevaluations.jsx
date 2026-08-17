import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Calculator, Check, Clock, RefreshCw, Send, X } from 'lucide-react';
import { Button } from '@/shared/components/Button/Button';
import { Badge } from '@/shared/components/Badge/Badge';
import { Alert } from '@/shared/components/Alert/Alert';
import { EmptyState } from '@/shared/components/EmptyState/EmptyState';
import { PageHeader } from '@/shared/components/PageHeader/PageHeader';
import { SkeletonRepeat } from '@/shared/components/Skeleton/Skeleton';
import { Hint } from '@/shared/components/Hint/Hint';
import { apiFetch } from '@/shared/utils/apiClient';
import {
  ProcessGuard,
  ProcessAccessDenied,
} from '@/shared/components/ProcessGuard/ProcessGuard';
import { useToast } from '@/shared/components/Toast/useToast';
import './MaterialRevaluations.css';

const PRORATION_OPTIONS = [
  { value: 'piece', label: 'Por pieza' },
  { value: 'cost', label: 'Por costo' },
  { value: 'volume', label: 'Por volumen' },
  { value: 'mixed', label: 'Prorrateo variado' },
];
const LINE_PRORATION_OPTIONS = [
  { value: 'piece', label: 'Pieza' },
  { value: 'cost', label: 'Costo' },
];
const MATERIAL_REVALUATION_PROCESS = 'material_revaluation';
const REVALUATIONS_UPDATED_EVENT = 'material-revaluations:updated';

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function round(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round(toNumber(value) * factor) / factor;
}

function getBase(line, prorationType) {
  const transferQuantity = toNumber(line.transferQuantity);
  const currentCost = toNumber(line.currentCost);
  const volume = toNumber(line.volume);
  // En "mixed" cada línea trae su propio método (asignado por el operador);
  // el resto de la tabla ignora `line.lineProrationType`.
  const effectiveType = prorationType === 'mixed'
    ? line.lineProrationType || 'piece'
    : prorationType;

  if (effectiveType === 'cost') return transferQuantity * currentCost;
  if (effectiveType === 'volume') return transferQuantity * volume;
  return transferQuantity;
}

// El prorrateo mixto no puede sumar las bases crudas de cada línea en un único total:
// una base "por pieza" (cantidad) y una "por costo" (cantidad × costo) viven en escalas
// distintas, así que sumarlas hace que la línea por costo se coma casi todo el flete solo
// por el tamaño del número, no por lo que realmente le corresponde. La corrección reparte
// en dos pasos: el peso ENTRE métodos siempre son las piezas físicas (la única unidad
// comparable entre una línea por costo y una por pieza), y DENTRO de cada grupo se reparte
// esa porción según el método que eligió el operador para esas líneas.
function calculateMixedShares(lines) {
  const totalQuantity = lines.reduce((sum, line) => sum + toNumber(line.transferQuantity), 0);
  const groups = new Map();

  for (const line of lines) {
    const method = line.lineProrationType || 'piece';
    const group = groups.get(method) || { qty: 0, base: 0 };
    group.qty += toNumber(line.transferQuantity);
    group.base += getBase(line, method);
    groups.set(method, group);
  }

  return lines.map((line) => {
    const method = line.lineProrationType || 'piece';
    const group = groups.get(method);
    const withinGroupShare = group.base > 0 ? getBase(line, method) / group.base : 0;
    const groupShare = totalQuantity > 0 ? group.qty / totalQuantity : 0;
    return groupShare * withinGroupShare;
  });
}

function calculateSuggestedRows(review, lines, prorationType) {
  const freightCost = toNumber(review?.freightCost);
  const isMixed = prorationType === 'mixed';
  const bases = lines.map((line) => (isMixed
    ? toNumber(line.transferQuantity)
    : getBase(line, prorationType)));
  const totalBase = bases.reduce((sum, value) => sum + value, 0);
  const shares = isMixed ? calculateMixedShares(lines) : bases.map((base) => (totalBase > 0 ? base / totalBase : 0));

  return lines.map((line, index) => {
    const transferQuantity = toNumber(line.transferQuantity);
    const currentCost = toNumber(line.currentCost);
    const base = bases[index];
    const share = shares[index];
    const freightAssigned = share * freightCost;
    const unitIncrease = transferQuantity > 0 ? freightAssigned / transferQuantity : 0;
    const revaluatedCost = currentCost + unitIncrease;
    // Participación que carga UNA sola pieza de esta línea, no la línea completa:
    // repartir el % de la línea entre sus propias unidades.
    const pieceParticipation = transferQuantity > 0 ? share / transferQuantity : 0;

    return {
      ...line,
      base: round(base, 6),
      share: round(share, 10),
      pieceParticipation: round(pieceParticipation, 10),
      freightAssigned: round(freightAssigned, 2),
      unitIncrease: round(unitIncrease, 10),
      revaluatedCost: round(revaluatedCost, 2),
    };
  });
}

function calculateRows(review, lines, prorationType) {
  const suggestedRows = calculateSuggestedRows(review, lines, prorationType);
  const freightCost = toNumber(review?.freightCost);
  const totalBase = suggestedRows.reduce((sum, line) => sum + toNumber(line.base), 0);

  const rows = suggestedRows.map((line, index) => {
    const sourceLine = lines[index] || {};
    const transferQuantity = toNumber(line.transferQuantity);
    const currentCost = toNumber(line.currentCost);
    // `sourceLine.revaluatedCost` YA viene poblado desde `createLineState` con el
    // valor sugerido (nunca '', null ni undefined), así que comprobar que "no esté
    // vacío" siempre daba true y fijaba el costo guardado en `lines` aunque nunca lo
    // haya tocado el operador — cambiar el método de una línea en "Prorrateo variado"
    // recalculaba `line.revaluatedCost` (fresco) pero el render se quedaba con el
    // valor viejo de `sourceLine.revaluatedCost`, y el Impacto no se movía. La bandera
    // real de "el operador lo escribió a mano" es `manualCost`.
    const hasManualCost = sourceLine.manualCost === true;
    const revaluatedCost = hasManualCost
      ? toNumber(sourceLine.revaluatedCost, currentCost)
      : toNumber(line.revaluatedCost, currentCost);
    const difference = revaluatedCost - currentCost;
    const estimatedImpact = difference * transferQuantity;

    return {
      ...line,
      revaluatedCost: round(revaluatedCost, 2),
      difference: round(difference, 10),
      estimatedImpact: round(estimatedImpact, 2),
    };
  });

  return {
    rows,
    totals: {
      freightCost: round(freightCost, 2),
      totalBase: round(totalBase, 6),
      distributedFreight: round(rows.reduce((sum, row) => sum + row.freightAssigned, 0), 2),
      estimatedImpact: round(rows.reduce((sum, row) => sum + row.estimatedImpact, 0), 2),
    },
  };
}

function formatMoney(value) {
  return `${toNumber(value).toLocaleString('es-MX', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} MXP`;
}

function formatNumber(value, decimals = 4) {
  return toNumber(value).toLocaleString('es-MX', {
    maximumFractionDigits: decimals,
  });
}

function formatPercent(fraction, decimals = 2) {
  return `${(toNumber(fraction) * 100).toFixed(decimals)}%`;
}

function formatRequestedAt(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString('es-MX', { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short' });
}

const WAITING_WARN_SECONDS = 24 * 3600;
const WAITING_CRIT_SECONDS = 72 * 3600;

function formatWaiting(seconds) {
  const total = Math.max(0, Math.floor(toNumber(seconds)));
  if (total < 3600) return `${Math.max(1, Math.round(total / 60))} min`;
  if (total < 86400) return `${Math.floor(total / 3600)} h`;
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  return hours > 0 ? `${days} d ${hours} h` : `${days} d`;
}

// Solo se marca cuando la espera ya es notable: por debajo de 24 h no aporta y
// ensucia la bandeja. warning a partir de 24 h, error a partir de 72 h.
function waitingBadge(seconds) {
  const total = toNumber(seconds);
  if (total < WAITING_WARN_SECONDS) return null;
  return {
    variant: total >= WAITING_CRIT_SECONDS ? 'error' : 'warning',
    label: `${formatWaiting(total)} en espera`,
  };
}

function parseRequester(raw) {
  if (!raw) return { name: null, email: null };
  const match = String(raw).match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (match) {
    return { name: match[1] || null, email: match[2].trim() };
  }
  return { name: null, email: String(raw).trim() };
}

function createLineState(review, prorationType = 'piece') {
  const normalizedLines = (review?.lines || []).map((line) => ({
    ...line,
    transferQuantity: toNumber(line.transferQuantity),
    stockActualSap: toNumber(line.stockActualSap),
    currentCost: toNumber(line.currentCost),
    volume: toNumber(line.volume),
    manualCost: false,
    lineProrationType: line.lineProrationType || 'piece',
  }));

  return calculateSuggestedRows(review, normalizedLines, prorationType);
}

function recalculateLinesForProration(review, currentLines, prorationType) {
  const recalculated = calculateSuggestedRows(review, currentLines, prorationType);

  return recalculated.map((line, index) => {
    const sourceLine = currentLines[index];

    if (sourceLine?.manualCost) {
      return { ...line, revaluatedCost: sourceLine.revaluatedCost, manualCost: true };
    }

    return line;
  });
}

function buildApiError(json, fallback) {
  const error = new Error(buildApiErrorMessage(json, fallback));
  error.requiresManualCheck = json?.requiresManualCheck === true;

  return error;
}

function buildApiErrorMessage(json, fallback) {
  const workflowResult = json?.workflowResult;
  const details = [];

  if (workflowResult?.status) {
    details.push(`Codigo de estado: ${workflowResult.status}`);
  }

  if (workflowResult?.responsePreview || workflowResult?.response) {
    details.push(
      String(workflowResult.responsePreview || workflowResult.response).slice(0, 500),
    );
  }

  return [json?.message || fallback, ...details].filter(Boolean).join(' | ');
}

function MaterialRevaluationsContent() {
  // Antes esto era un accessState de tres valores que hacia el gate a mano. Lo
  // hace ProcessGuard, que ademas no monta este componente hasta confirmarlo:
  // por eso los efectos de abajo ya no comprueban el acceso. Lo unico que
  // sobrevive es el caso que el guard no puede ver -- que el servidor revoque
  // el acceso con la pagina ya abierta y responda 403 --, y para eso basta un
  // booleano.
  const [accessRevoked, setAccessRevoked] = useState(false);
  const [pending, setPending] = useState([]);
  const [selectedExecutionId, setSelectedExecutionId] = useState(null);
  const [lines, setLines] = useState([]);
  const [prorationType, setProrationType] = useState('piece');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const toast = useToast();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [calcModalOpen, setCalcModalOpen] = useState(false);

  const selected = pending.find(
    (item) => item.execution.execution_id === selectedExecutionId,
  ) || pending[0] || null;

  const calculation = useMemo(
    () => calculateRows(selected?.review, lines, prorationType),
    [selected?.review, lines, prorationType],
  );
  const hasVolume = useMemo(
    () => lines.some((line) => toNumber(line.volume) > 0),
    [lines],
  );
  const availableProrationOptions = useMemo(
    () => PRORATION_OPTIONS.filter((option) => option.value !== 'volume' || hasVolume),
    [hasVolume],
  );

  const hasInvalidCost = useMemo(
    () => calculation.rows.some(
      (row) => toNumber(row.revaluatedCost) < toNumber(row.currentCost) - 0.005,
    ),
    [calculation.rows],
  );

  const fetchPending = async () => {
    try {
      setIsLoading(true);
      setError(false);

      const response = await apiFetch('/api/material-revaluations/pending');
      const json = await response.json();

      if (!response.ok || !json.success) {
        if (response.status === 403) {
          setAccessRevoked(true);
        }

        throw new Error(json.message || 'No se pudieron consultar las revaluaciones.');
      }

      const data = json.data || [];

      setPending(data);
      setSelectedExecutionId((current) => {
        if (current && data.some((item) => item.execution.execution_id === current)) {
          return current;
        }

        return data[0]?.execution?.execution_id || null;
      });
    } catch (err) {
      setError(true);
      toast.error(err.message, { duration: 0 });
    } finally {
      setIsLoading(false);
    }
  };

  // Sin comprobacion de acceso: este componente solo se monta cuando
  // ProcessGuard ya la hizo.
  useEffect(() => {
    fetchPending();
  }, []);

  useEffect(() => {
    if (typeof window.EventSource === 'undefined') return undefined;

    const source = new window.EventSource('/api/material-revaluations/stream');
    const timers = [];

    source.addEventListener('pending', () => {
      fetchPending();
      timers.push(window.setTimeout(fetchPending, 1500));
      timers.push(window.setTimeout(fetchPending, 4000));
    });

    return () => {
      source.close();
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  useEffect(() => {
    setProrationType('piece');
    setRejectOpen(false);
    setRejectionReason('');
    setConfirmOpen(false);
  }, [selected?.execution?.execution_id]);

  const previousExecutionIdRef = useRef(selected?.execution?.execution_id);

  useEffect(() => {
    const executionChanged =
      previousExecutionIdRef.current !== selected?.execution?.execution_id;
    previousExecutionIdRef.current = selected?.execution?.execution_id;

    if (executionChanged) {
      setLines(createLineState(selected?.review, prorationType));
      return;
    }

    setLines((current) =>
      recalculateLinesForProration(selected?.review, current, prorationType),
    );
  }, [selected?.execution?.execution_id, selected?.review, prorationType]);

  useEffect(() => {
    if (!hasVolume && prorationType === 'volume') {
      setProrationType('piece');
    }
  }, [hasVolume, prorationType]);

  const updateLine = (index, field, value) => {
    setLines((current) =>
      current.map((line, lineIndex) =>
        lineIndex === index
          ? {
            ...line,
            [field]: value,
            ...(field === 'revaluatedCost' ? { manualCost: true } : {}),
          }
          : line,
      ),
    );
  };

  const restoreSuggested = (index) => {
    const row = calculation.rows[index];
    if (!row) return;
    const suggested = round(toNumber(row.currentCost) + toNumber(row.unitIncrease), 2);
    setLines((current) =>
      current.map((line, lineIndex) =>
        lineIndex === index
          ? { ...line, revaluatedCost: suggested, manualCost: false }
          : line,
      ),
    );
  };

  const cancelReject = () => {
    setRejectOpen(false);
    setRejectionReason('');
  };

  const buildMetadata = () => ({
    requestId: selected.review.requestId,
    requesterEmail: selected.review.requesterEmail,
    docNum: selected.review.docNum,
    docNums: selected.review.docNums,
    freightFolio: selected.review.freightFolio,
    carrierName: selected.review.carrierName,
    freightCost: selected.review.freightCost,
    accountCode: selected.review.accountCode,
    baseDocumentType: selected.review.baseDocumentType,
    baseDocumentNumber: selected.review.baseDocumentNumber,
    audit: selected.review.audit,
  });

  const approveReview = async () => {
    if (!selected) return;

    if (hasInvalidCost) {
      toast.error('El costo nuevo no puede ser menor al costo actual en una revaluación de flete. Corrige las líneas marcadas.');
      return;
    }

    const targetId = selected.execution.execution_id;
    const requestBody = JSON.stringify({
      approvalId: selected.approval.id,
      prorationType,
      metadata: buildMetadata(),
      totals: calculation.totals,
      lines: calculation.rows,
    });

    try {
      setIsSubmitting(true);
      setConfirmOpen(false);

      setPending((current) =>
        current.filter((item) => item.execution.execution_id !== targetId),
      );

      const response = await apiFetch(
        `/api/material-revaluations/${targetId}/approve`,
        { method: 'POST', body: requestBody },
      );
      const json = await response.json();

      if (!response.ok || !json.success) {
        throw buildApiError(json, 'No se pudo aprobar la revaluacion.');
      }

      toast.success(json.message);

      window.dispatchEvent(new Event(REVALUATIONS_UPDATED_EVENT));
      await fetchPending();
    } catch (err) {
      toast.error(err.message, err.requiresManualCheck ? { duration: 0 } : undefined);
      await fetchPending();
    } finally {
      setIsSubmitting(false);
    }
  };

  const rejectReview = async () => {
    if (!selected) return;

    const targetId = selected.execution.execution_id;
    const requestBody = JSON.stringify({
      approvalId: selected.approval.id,
      rejectionReason,
      metadata: buildMetadata(),
    });

    try {
      setIsSubmitting(true);

      setRejectOpen(false);
      setRejectionReason('');
      setPending((current) =>
        current.filter((item) => item.execution.execution_id !== targetId),
      );

      const response = await apiFetch(
        `/api/material-revaluations/${targetId}/reject`,
        { method: 'POST', body: requestBody },
      );
      const json = await response.json();

      if (!response.ok || !json.success) {
        throw buildApiError(json, 'No se pudo rechazar la revaluacion.');
      }

      toast.success(json.message);
      window.dispatchEvent(new Event(REVALUATIONS_UPDATED_EVENT));
      await fetchPending();
    } catch (err) {
      toast.error(err.message, err.requiresManualCheck ? { duration: 0 } : undefined);
      await fetchPending();
    } finally {
      setIsSubmitting(false);
    }
  };

  // El «validando» y el acceso que nunca existio los resuelve ProcessGuard.
  // Aqui solo queda el acceso retirado con la pagina ya abierta.
  if (accessRevoked) {
    return (
      <ProcessAccessDenied
        moduleName="revaluaciones"
        className="material-revaluations-page"
      />
    );
  }

  if (error && !isLoading) {
    return (
      <div className="material-revaluations-page">
        <PageHeader title="Revaluaciones pendientes" />
        <div style={{ padding: '24px' }}>
          <EmptyState
            tone="error"
            title="Error al cargar las revaluaciones"
            description="Hubo un problema al consultar la bandeja de revaluaciones pendientes."
            action={{
              label: 'Reintentar',
              onClick: fetchPending,
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="material-revaluations-page">
      <PageHeader
        title="Revaluaciones pendientes"
        actions={
          <Button variant="secondary" onClick={fetchPending} disabled={isLoading}>
            <RefreshCw size={16} />
            Actualizar
          </Button>
        }
      />



      <div className="revaluations-workspace">
        <aside className="pending-list">
          <div className="pending-list-header">
            <span>Pendientes</span>
            <strong>{pending.length}</strong>
          </div>

          {isLoading ? (
            <div
              style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}
              role="status"
              aria-label="Cargando pendientes"
              aria-busy="true"
            >
              <SkeletonRepeat count={3} height={44} borderRadius="var(--radius-md)" />
            </div>
          ) : pending.length === 0 ? (
            <EmptyState
              icon={Calculator}
              title="Sin pendientes"
              description="No hay revaluaciones pendientes de revisión."
            />
          ) : (
            <>
              {pending.map((item) => {
                const isSelected = item.execution.execution_id === selected?.execution?.execution_id;
                const aging = waitingBadge(item.approval?.waiting_seconds);

                return (
                  <button
                    key={item.execution.execution_id}
                    className={`pending-item ${isSelected ? 'active' : ''}`}
                    onClick={() => setSelectedExecutionId(item.execution.execution_id)}
                  >
                    <span className="pending-main">
                      {item.review.freightFolio || item.execution.execution_id}
                      {aging && (
                        <Badge variant={aging.variant} size="sm" icon={Clock}>{aging.label}</Badge>
                      )}
                    </span>
                    <span className="pending-meta">
                      {item.review.docNum || 'Sin traspaso'} - {formatMoney(item.review.freightCost)}
                    </span>
                    <span className="pending-requester">
                      {(() => {
                        const requester = parseRequester(item.review.requesterEmail);
                        return requester.name || requester.email || 'Solicitante no especificado';
                      })()}
                    </span>
                  </button>
                );
              })}

              {/* Con pocos pendientes, la columna deja hueco en blanco debajo
                  del último ítem (se estira para igualar la altura del panel
                  de revisión). Esta nota lo ocupa con contexto real en vez de
                  dejarlo vacío — `margin-top: auto` en .pending-list-footer
                  la ancla al fondo sin importar cuántos ítems haya arriba. */}
              {pending.length <= 3 && (
                <p className="pending-list-footer">
                  Solo {pending.length === 1 ? 'queda 1 pendiente' : `quedan ${pending.length} pendientes`} — bandeja casi al día.
                </p>
              )}
            </>
          )}
        </aside>

        <section className="review-panel">
          {!selected ? (
            <div className="review-placeholder">Seleccione una revaluacion pendiente.</div>
          ) : (
            <>
              <div className="review-toolbar">
                <div>
                  <h2>{selected.review.freightFolio || selected.execution.execution_id}</h2>
                  <p>
                    Traspaso(s): {selected.review.docNum || '-'} - Documento base:{' '}
                    {selected.review.baseDocumentType || '-'} {selected.review.baseDocumentNumber || ''}
                  </p>
                  {(() => {
                    const requester = parseRequester(selected.review.requesterEmail);
                    const requestedAt = formatRequestedAt(selected.approval?.requested_at);
                    const aging = waitingBadge(selected.approval?.waiting_seconds);
                    return (
                      <p className="review-requester">
                        Solicitante:{' '}
                        <strong>{requester.name || requester.email || 'No especificado'}</strong>
                        {requester.name && requester.email && (
                          <span className="review-requester-email"> · {requester.email}</span>
                        )}
                        {requestedAt && <> · Solicitado: {requestedAt}</>}
                        {aging && (
                          <>
                            {' '}
                            <Badge variant={aging.variant} size="sm" icon={Clock}>{aging.label}</Badge>
                          </>
                        )}
                      </p>
                    );
                  })()}
                </div>
                <div className="review-proration-control">
                  <label htmlFor="proration-type">Prorrateo</label>
                  <select
                    id="proration-type"
                    value={prorationType}
                    onChange={(event) => setProrationType(event.target.value)}
                  >
                    {availableProrationOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="review-metrics">
                <div>
                  <span className="metric-with-hint">
                    Costo flete
                    <Hint
                      position="bottom"
                      text={`Origen: Total del documento − IVA (DocTotal − VatSum). `
                        + `Documento base: ${selected.review.baseDocumentType || '-'} ${selected.review.baseDocumentNumber || ''}. `
                        + `Folio: ${selected.review.freightFolio || '-'}. `
                        + `Transportista: ${selected.review.carrierName || '-'}.`}
                    />
                  </span>
                  <strong>{formatMoney(calculation.totals.freightCost)}</strong>
                </div>
                <div>
                  <span>Base total</span>
                  <strong>{formatNumber(calculation.totals.totalBase, 6)}</strong>
                </div>
                <div>
                  <span>Flete distribuido</span>
                  <strong>{formatMoney(calculation.totals.distributedFreight)}</strong>
                </div>
                <div>
                  <span>Impacto estimado</span>
                  <strong>{formatMoney(calculation.totals.estimatedImpact)}</strong>
                </div>
              </div>

              <div className="review-lines-toolbar">
                <Button variant="secondary" onClick={() => setCalcModalOpen(true)}>
                  <Calculator size={16} />
                  Cómo se calculó
                </Button>
              </div>

              <div className="review-lines-table">
                <table>
                  <thead>
                    <tr>
                      <th>
                        Artículo
                        <Hint text="Código único de artículo en SAP" position="bottom" />
                      </th>
                      <th>
                        Descripción
                        <Hint text="Descripción detallada del material" position="bottom" />
                      </th>
                      <th>
                        Almacén
                        <Hint text="Código del almacén destino" position="bottom" />
                      </th>
                      <th>
                        Cant. traspaso
                        <Hint text="Cantidad total de unidades transferidas" position="bottom" />
                      </th>
                      <th>
                        Participación/pza
                        <Hint text="Porcentaje del flete que carga UNA sola pieza de este artículo (participación de la línea ÷ cantidad de traspaso)" position="bottom" />
                      </th>
                      <th>
                        Stock SAP
                        <Hint text="Stock actual reportado en el sistema SAP" position="bottom" />
                      </th>
                      <th>
                        Costo actual
                        <Hint text="Costo promedio unitario en SAP previo a la revaluación" position="bottom" />
                      </th>
                      {hasVolume && (
                        <th>
                          Volumen
                          <Hint text="Volumen total unitario para distribución de flete" position="bottom" />
                        </th>
                      )}
                      {prorationType === 'mixed' && (
                        <th>
                          Método
                          <Hint text="Base de prorrateo asignada a este artículo (pieza o costo)" position="bottom" />
                        </th>
                      )}
                      <th>
                        Participación
                        <Hint text="Porción del flete que absorbe este artículo (base de la línea ÷ base total)" position="bottom" />
                      </th>
                      <th>
                        Flete
                        <Hint text="Monto de flete prorrateado asignado a este artículo (participación × costo de flete)" position="bottom" />
                      </th>
                      <th>
                        Incremento/pza
                        <Hint text="Cuánto sube el costo por unidad (flete asignado ÷ cantidad de traspaso)" position="bottom" />
                      </th>
                      <th>
                        Costo nuevo
                        <Hint text="Costo unitario revaluado = costo actual + incremento por pieza" position="bottom" />
                      </th>
                      <th>
                        Impacto
                        <Hint text="Diferencia o variación de costo total (Costo Nuevo - Costo Actual) * Stock" position="bottom" />
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {calculation.rows.map((line, index) => (
                      <tr key={`${line.itemCode}-${line.warehouseCode}-${index}`}>
                        <td>{line.itemCode || '-'}</td>
                        <td>{line.itemDescription || '-'}</td>
                        <td>{line.warehouseCode || '-'}</td>
                        <td>{formatNumber(line.transferQuantity)}</td>
                        <td>{formatPercent(line.pieceParticipation, 4)}</td>
                        <td>{formatNumber(line.stockActualSap)}</td>
                        <td>{formatMoney(line.currentCost)}</td>
                        {hasVolume && <td>{formatNumber(line.volume)}</td>}
                        {prorationType === 'mixed' && (
                          <td>
                            <select
                              value={lines[index]?.lineProrationType || 'piece'}
                              onChange={(event) => updateLine(index, 'lineProrationType', event.target.value)}
                            >
                              {LINE_PRORATION_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          </td>
                        )}
                        <td>{formatPercent(line.share)}</td>
                        <td>{formatMoney(line.freightAssigned)}</td>
                        <td>{formatMoney(line.unitIncrease)}</td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={lines[index]?.revaluatedCost ?? 0}
                            onChange={(event) => updateLine(index, 'revaluatedCost', event.target.value)}
                            title={line.revaluatedCost < line.currentCost - 0.005 ? 'El costo nuevo no puede ser menor al costo actual' : undefined}
                            style={line.revaluatedCost < line.currentCost - 0.005
                              ? { borderColor: 'var(--color-error)', outline: '1px solid var(--color-error)' }
                              : undefined}
                          />
                          <div className="cost-cell-meta">
                            <span className={`cost-badge ${lines[index]?.manualCost ? 'manual' : 'suggested'}`}>
                              {lines[index]?.manualCost ? 'Manual' : 'Sugerido'}
                            </span>
                            {lines[index]?.manualCost && (
                              <button
                                type="button"
                                className="cost-restore-btn"
                                onClick={() => restoreSuggested(index)}
                              >
                                Restaurar sugerido
                              </button>
                            )}
                          </div>
                        </td>
                        <td>{formatMoney(line.estimatedImpact)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {rejectOpen && (
                <div className="reject-box">
                  <label htmlFor="rejection-reason">Motivo de rechazo</label>
                  <textarea
                    id="rejection-reason"
                    value={rejectionReason}
                    onChange={(event) => setRejectionReason(event.target.value)}
                    rows={4}
                    placeholder="Explique por que se rechaza la revaluacion..."
                  />
                </div>
              )}

              {hasInvalidCost && (
                <Alert variant="error" title="Costo nuevo menor al costo actual">
                  Una revaluación de flete solo puede aumentar el costo. Corrige las líneas marcadas en rojo (costo nuevo menor al actual) antes de aprobar.
                </Alert>
              )}

              <div className="review-actions-bar">
                {rejectOpen ? (
                  <>
                    <Button
                      variant="secondary"
                      onClick={cancelReject}
                      disabled={isSubmitting}
                    >
                      <X size={16} />
                      Cancelar
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={rejectReview}
                      disabled={isSubmitting || rejectionReason.trim().length < 5}
                    >
                      <Send size={16} />
                      Enviar rechazo
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="secondary"
                      onClick={() => setRejectOpen(true)}
                      disabled={isSubmitting}
                    >
                      <X size={16} />
                      Rechazar
                    </Button>
                    <Button
                      variant="primary"
                      onClick={() => setConfirmOpen(true)}
                      disabled={isSubmitting || calculation.rows.length === 0 || hasInvalidCost}
                    >
                      <Check size={16} />
                      Aprobar y enviar SAP
                    </Button>
                  </>
                )}
              </div>

              {confirmOpen && (
                <div
                  className="confirm-modal-overlay"
                  onClick={() => !isSubmitting && setConfirmOpen(false)}
                >
                  <div
                    className="confirm-modal"
                    role="dialog"
                    aria-modal="true"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <h3>Confirmar envío a SAP</h3>
                    <p>Esta acción es irreversible. ¿Desea continuar?</p>
                    <div className="confirm-modal-actions">
                      <Button
                        variant="secondary"
                        onClick={() => setConfirmOpen(false)}
                        disabled={isSubmitting}
                      >
                        <X size={16} />
                        Cancelar
                      </Button>
                      <Button
                        variant="primary"
                        onClick={approveReview}
                        disabled={isSubmitting}
                      >
                        <Check size={16} />
                        Confirmar
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {calcModalOpen && (
                <div className="confirm-modal-overlay" onClick={() => setCalcModalOpen(false)}>
                  <div
                    className="confirm-modal calc-detail-modal"
                    role="dialog"
                    aria-modal="true"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <h3>Cómo se calculó la revaluación</h3>
                    <div className="calc-detail-context">
                      <span>Prorrateo: <strong>{(availableProrationOptions.find((o) => o.value === prorationType) || {}).label || prorationType}</strong></span>
                      <span>Costo de flete total: <strong>{formatMoney(calculation.totals.freightCost)}</strong></span>
                      <span>Base total: <strong>{formatNumber(calculation.totals.totalBase)}</strong></span>
                    </div>
                    <ol className="calc-formula-steps">
                      <li>
                        <span className="calc-step-num">1</span>
                        {prorationType === 'mixed' ? (
                          <span>
                            <strong>Participación</strong> = (piezas del método de esta línea ÷ piezas totales) × (base de la línea ÷ base del método de esta línea) — cada línea compite solo contra las líneas que comparten su mismo método, no contra toda la tabla
                          </span>
                        ) : (
                          <span><strong>Participación</strong> = Base ÷ Base total</span>
                        )}
                      </li>
                      <li>
                        <span className="calc-step-num">2</span>
                        <span><strong>Flete asignado</strong> = Participación × Costo de flete</span>
                      </li>
                      <li>
                        <span className="calc-step-num">3</span>
                        <span><strong>Incremento/pza</strong> = Flete ÷ Cantidad</span>
                      </li>
                      <li>
                        <span className="calc-step-num">4</span>
                        <span><strong>Costo nuevo</strong> = Costo actual + Incremento</span>
                      </li>
                      <li>
                        <span className="calc-step-num">5</span>
                        <span><strong>Impacto</strong> = (Costo nuevo − Costo actual) × Cantidad</span>
                      </li>
                    </ol>
                    <div className="calc-detail-table-wrap">
                      <table className="calc-detail-table">
                        <thead>
                          <tr>
                            <th>Artículo</th>
                            <th>Participación</th>
                            <th>Flete asignado</th>
                            <th>Incremento/pza</th>
                            <th>Cálculo del costo nuevo</th>
                            <th>Impacto</th>
                          </tr>
                        </thead>
                        <tbody>
                          {calculation.rows.map((r, i) => {
                            const suggestedNew = toNumber(r.currentCost) + toNumber(r.unitIncrease);
                            const isManual = lines[i]?.manualCost;
                            return (
                              <tr key={`${r.itemCode}-${r.warehouseCode}-${i}`}>
                                <td>
                                  {r.itemCode}
                                  <span className="calc-sub">Alm. {r.warehouseCode || '-'}</span>
                                </td>
                                <td>{formatPercent(r.share)}</td>
                                <td>{formatMoney(r.freightAssigned)}</td>
                                <td>{formatMoney(r.unitIncrease)}</td>
                                <td>
                                  {formatNumber(r.currentCost, 2)} + {formatNumber(r.unitIncrease, 2)} = <strong>{formatNumber(suggestedNew, 2)}</strong>
                                  {isManual && (
                                    <span className="calc-manual-tag">Manual: {formatNumber(r.revaluatedCost, 2)}</span>
                                  )}
                                </td>
                                <td className="calc-result">{formatMoney(r.estimatedImpact)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr>
                            <td>Totales</td>
                            <td>{formatPercent(1)}</td>
                            <td className="calc-result">{formatMoney(calculation.totals.distributedFreight)}</td>
                            <td />
                            <td />
                            <td className="calc-result">{formatMoney(calculation.totals.estimatedImpact)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                    <p className="calc-detail-manual">
                      El flete total (<strong>{formatMoney(calculation.totals.freightCost)}</strong>) se reparte completo entre los productos: la suma del flete asignado y del impacto contable debe igualar ese monto.
                    </p>
                    <div className="confirm-modal-actions">
                      <Button variant="secondary" onClick={() => setCalcModalOpen(false)}>
                        <X size={16} />
                        Cerrar
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

/**
 * MaterialRevaluations — Bandeja de revisión de revaluaciones de material.
 *
 * Solo aplica el gate de proceso; el contenido vive en
 * `MaterialRevaluationsContent` y no se monta hasta que el acceso está
 * confirmado. Esa separación importa: la página abre un `EventSource` y
 * encadena temporizadores, y montarla «por si acaso» dejaba una conexión SSE
 * abierta contra un endpoint que iba a responder 403.
 */
export function MaterialRevaluations() {
  return (
    <ProcessGuard
      processCode={MATERIAL_REVALUATION_PROCESS}
      moduleName="revaluaciones"
      className="material-revaluations-page"
    >
      <MaterialRevaluationsContent />
    </ProcessGuard>
  );
}
