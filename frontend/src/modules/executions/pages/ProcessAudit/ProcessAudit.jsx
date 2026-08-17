import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { BarChart3, ClipboardCheck, Wallet } from 'lucide-react';
import { DataCard } from '@/shared/components/DataCard/DataCard';
import { DataTable } from '@/shared/components/DataTable/DataTable';
import { EmptyState } from '@/shared/components/EmptyState/EmptyState';
import { PageHeader } from '@/shared/components/PageHeader/PageHeader';
import { Skeleton } from '@/shared/components/Skeleton/Skeleton';
import { CategoryBarChart } from '@/modules/executions/components/CategoryBarChart/CategoryBarChart';
import { buildProcessKpis } from '@/modules/executions/utils/processKpis';
import { categoricalColor } from '@/modules/executions/utils/chartTheme';
import { apiFetch } from '@/shared/utils/apiClient';
import './ProcessAudit.css';

const PROCESS_META = {
  international_purchases: { name: 'Compras Internacionales', endpoint: '/api/international-purchases/dashboard-summary' },
  material_revaluation: { name: 'Revaluaciones', endpoint: '/api/material-revaluations/dashboard-summary' },
};

const SPEND_TOP_SUPPLIERS = 8;

const FINANCIALS_ENDPOINT = {
  material_revaluation: '/api/material-revaluations/audit-financials',
};

function formatMoney(value, currency = 'MXN') {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

function sumByKey(rows, key) {
  const totals = new Map();
  for (const row of rows || []) {
    const label = row[key] || '—';
    totals.set(label, (totals.get(label) || 0) + (Number(row.amount) || 0));
  }
  return totals;
}

export function ProcessAudit() {
  const { processCode } = useParams();
  const meta = PROCESS_META[processCode];

  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [financials, setFinancials] = useState(null);
  const financialsEndpoint = FINANCIALS_ENDPOINT[processCode];

  useEffect(() => {
    if (!meta) {
      setIsLoading(false);
      return undefined;
    }

    let active = true;
    setIsLoading(true);
    setError(null);

    apiFetch(meta.endpoint)
      .then(async (response) => {
        const json = await response.json();
        if (!response.ok || !json.success) {
          throw new Error(json.message || 'No se pudo obtener la información');
        }
        if (active) {
          setData(json.data);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (active) {
          setError(err.message);
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [meta]);

  useEffect(() => {
    if (!financialsEndpoint) {
      setFinancials(null);
      return undefined;
    }

    let active = true;
    setFinancials(null);
    apiFetch(financialsEndpoint)
      .then(async (response) => {
        const json = await response.json();
        if (response.ok && json.success && active) {
          setFinancials(json.data);
        }
      })
      .catch(() => {
        if (active) setFinancials(null);
      });

    return () => {
      active = false;
    };
  }, [financialsEndpoint]);

  const section = useMemo(
    () => (meta && data ? buildProcessKpis(processCode, data) : null),
    [meta, data, processCode],
  );

  const totalsByCurrency = useMemo(() => {
    const totals = new Map();
    for (const row of financials?.spend_over_time || []) {
      const currency = row.currency || 'MXN';
      totals.set(currency, (totals.get(currency) || 0) + (Number(row.amount) || 0));
    }
    return [...totals.entries()];
  }, [financials]);

  const supplierChart = useMemo(() => {
    const bySupplier = [...sumByKey(financials?.spend_by_supplier, 'supplier').entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, SPEND_TOP_SUPPLIERS)
      .map(([name, amount], index) => ({ name, value: amount, color: categoricalColor(index) }));

    return {
      data: bySupplier,
      layout: 'vertical',
      valueName: 'Gasto pagado',
      formatValue: (value) => formatMoney(value),
    };
  }, [financials]);

  const monthChart = useMemo(() => {
    const byMonth = [...sumByKey(financials?.spend_over_time, 'period').entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, amount]) => ({ name, value: amount, color: 'var(--color-secondary)' }));

    return {
      data: byMonth,
      layout: 'horizontal',
      valueName: 'Gasto pagado',
      formatValue: (value) => formatMoney(value),
    };
  }, [financials]);

  const revaluationChart = useMemo(() => ({
    data: (financials?.by_month || []).map((row) => ({
      name: row.period,
      value: Number(row.costo_flete) || 0,
      color: 'var(--color-secondary)',
    })),
    layout: 'horizontal',
    valueName: 'Flete revaluado',
    formatValue: (value) => formatMoney(value),
  }), [financials]);

  if (!meta) {
    return (
      <div className="process-audit-page">
        <PageHeader title="Auditoría" />
        <EmptyState
          icon={BarChart3}
          title="Proceso no reconocido"
          description="No hay métricas disponibles para este proceso."
        />
      </div>
    );
  }

  const cards = section?.cards || [];
  const charts = section?.charts || [];
  const tables = section?.tables || [];

  return (
    <div className="process-audit-page">
      <PageHeader
        title={`Auditoría · ${meta.name}`}
        subtitle="Métricas y estadísticas del proceso (solo lectura)."
      />

      {error ? (
        <EmptyState
          tone="error"
          title="No se pudieron cargar las métricas"
          description={error}
        />
      ) : (
        <>
          <div className="process-audit-grid">
            {isLoading
              ? Array.from({ length: 6 }).map((_, index) => <DataCard key={index} isLoading />)
              : cards.map((card) => (
                <DataCard
                  key={card.id}
                  title={card.title}
                  value={card.value}
                  icon={card.icon}
                  tone={card.tone}
                />
              ))}
          </div>

          {charts.length > 0 && (
            <div className="process-audit-charts">
              {charts.map((chart) => (
                <section key={chart.id} className="process-audit-section">
                  <h2 className="process-audit-section-title">{chart.title}</h2>
                  {chart.subtitle && <p className="process-audit-section-subtitle">{chart.subtitle}</p>}
                  <div
                    className="process-audit-chart-body"
                    style={{ height: `${Math.max(240, chart.layout === 'vertical' ? chart.data.length * 36 + 70 : 260)}px` }}
                  >
                    {isLoading ? (
                      <Skeleton height="100%" borderRadius="var(--radius-md)" />
                    ) : chart.data.length === 0 ? (
                      <EmptyState icon={BarChart3} title="Sin datos que graficar" description="No hay datos para el proceso." />
                    ) : (
                      <CategoryBarChart chart={chart} />
                    )}
                  </div>
                </section>
              ))}
            </div>
          )}

          {processCode === 'payments' && (
            <>
              <div className="process-audit-grid">
                {totalsByCurrency.length === 0 ? (
                  <DataCard title="Total pagado" value={formatMoney(0)} icon={Wallet} />
                ) : (
                  totalsByCurrency.map(([currency, amount]) => (
                    <DataCard key={currency} title={`Total pagado (${currency})`} value={formatMoney(amount, currency)} icon={Wallet} />
                  ))
                )}
              </div>

              <div className="process-audit-charts">
                <section className="process-audit-section">
                  <h2 className="process-audit-section-title">Gasto por proveedor</h2>
                  <p className="process-audit-section-subtitle">Los {SPEND_TOP_SUPPLIERS} proveedores con mayor gasto pagado.</p>
                  <div
                    className="process-audit-chart-body"
                    style={{ height: `${Math.max(240, supplierChart.data.length * 36 + 70)}px` }}
                  >
                    {supplierChart.data.length === 0 ? (
                      <EmptyState icon={BarChart3} title="Sin pagos registrados" description="Aún no hay pagos aplicados en SAP." />
                    ) : (
                      <CategoryBarChart chart={supplierChart} />
                    )}
                  </div>
                </section>

                <section className="process-audit-section">
                  <h2 className="process-audit-section-title">Gasto por mes</h2>
                  <p className="process-audit-section-subtitle">Monto pagado por mes, según la fecha de registro en SAP.</p>
                  <div className="process-audit-chart-body" style={{ height: '260px' }}>
                    {monthChart.data.length === 0 ? (
                      <EmptyState icon={BarChart3} title="Sin pagos registrados" description="Aún no hay pagos aplicados en SAP." />
                    ) : (
                      <CategoryBarChart chart={monthChart} />
                    )}
                  </div>
                </section>
              </div>
            </>
          )}

          {processCode === 'material_revaluation' && (
            <>
              <div className="process-audit-grid">
                <DataCard title="Flete revaluado (total)" value={formatMoney(financials?.totals?.costo_flete_total)} icon={Wallet} />
                <DataCard title="Revaluaciones completadas" value={String(financials?.totals?.revaluaciones ?? 0)} icon={ClipboardCheck} />
                <DataCard title="Flete promedio" value={formatMoney(financials?.totals?.costo_flete_promedio)} icon={Wallet} />
              </div>

              <div className="process-audit-charts">
                <section className="process-audit-section">
                  <h2 className="process-audit-section-title">Flete revaluado por mes</h2>
                  <p className="process-audit-section-subtitle">Costo de flete prorrateado en revaluaciones completadas.</p>
                  <div className="process-audit-chart-body" style={{ height: '260px' }}>
                    {revaluationChart.data.length === 0 ? (
                      <EmptyState icon={BarChart3} title="Sin revaluaciones" description="Aún no hay revaluaciones completadas." />
                    ) : (
                      <CategoryBarChart chart={revaluationChart} />
                    )}
                  </div>
                </section>
              </div>
            </>
          )}

          {tables.map((table) => (
            <section key={table.id} className="process-audit-section">
              <h2 className="process-audit-section-title">{table.title}</h2>
              {table.subtitle && <p className="process-audit-section-subtitle">{table.subtitle}</p>}
              <DataTable
                columns={table.columns}
                data={table.data}
                isLoading={isLoading}
                emptyMessage={table.emptyMessage}
              />
            </section>
          ))}
        </>
      )}
    </div>
  );
}
