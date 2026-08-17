import {
  Ship,
  Container,
  CalendarX,
  CalendarClock,
  Banknote,
  Wallet,
  FileWarning,
  Receipt,
  Scale,
  ClipboardCheck,
  Clock,
  TimerReset,
  Wrench,
  PackageCheck,
  Activity,
  CheckCircle2,
} from 'lucide-react';
import { Badge } from '@/shared/components/Badge/Badge';
import { num, categoricalColor } from './chartTheme';

/**
 * Traduce la respuesta del endpoint de indicadores de cada proceso a la misma
 * estructura de tarjetas, gráficas y tablas, para que el Dashboard las pinte sin
 * saber de qué dominio vienen.
 *
 * Es un util y no un componente a propósito: el Dashboard ya tiene `DataCard`,
 * `ChartCard` y `DataTable` para pintar; lo único que cambia por proceso son los
 * datos. Lleva extensión `.jsx` porque las columnas de `tables` definen sus
 * celdas con JSX (`Badge`), y esbuild solo transforma JSX en `.jsx`.
 */

const currencyFormatters = new Map();

function formatAmount(value, currency = 'MXN') {
  if (!currencyFormatters.has(currency)) {
    currencyFormatters.set(
      currency,
      new Intl.NumberFormat('es-MX', {
        style: 'currency',
        currency,
        maximumFractionDigits: 0,
      }),
    );
  }

  return currencyFormatters.get(currency).format(num(value));
}

function formatCount(value) {
  return new Intl.NumberFormat('es-MX').format(num(value));
}

/** Duración en milisegundos a texto corto. Reutiliza la escala del Dashboard. */
function formatDurationMs(ms) {
  const totalSeconds = Math.floor(num(ms) / 1000);

  if (totalSeconds <= 0) {
    return '—';
  }

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

/** Suma un campo de una colección agrupada por moneda u otra dimensión. */
function sumBy(rows, field, predicate = () => true) {
  return (rows || [])
    .filter(predicate)
    .reduce((total, row) => total + num(row[field]), 0);
}

/* ─── Pagos ─────────────────────────────────────────────────────────────── */

const PROPOSAL_STATUS_LABELS = {
  PENDING_AUTH: 'Por autorizar',
  AUTHORIZED: 'Autorizadas',
  REJECTED: 'Rechazadas',
  DISPERSED: 'Dispersadas',
  CLOSED: 'Cerradas',
};

const PROPOSAL_STATUS_COLORS = {
  PENDING_AUTH: 'var(--color-warning)',
  AUTHORIZED: 'var(--color-success)',
  REJECTED: 'var(--color-error)',
  DISPERSED: 'var(--color-info)',
  CLOSED: 'var(--color-muted-text)',
};

const AGING_BUCKET_LABELS = {
  vencido: 'Vencido',
  proximo_7d: 'Vence en 7 días',
  proximo_30d: 'Vence en 30 días',
  futuro: 'Más adelante',
  sin_fecha: 'Sin fecha',
};

const AGING_BUCKET_COLORS = {
  vencido: 'var(--color-error)',
  proximo_7d: 'var(--color-warning)',
  proximo_30d: 'var(--color-info)',
  futuro: 'var(--color-success)',
  sin_fecha: 'var(--color-muted-text)',
};

const AGING_BUCKET_ORDER = ['vencido', 'proximo_7d', 'proximo_30d', 'futuro', 'sin_fecha'];

function buildPayments(data) {
  const proposals = data.proposals || [];
  const aging = data.aging || [];
  const compliance = data.compliance || {};
  const reconciliation = data.reconciliation || {};

  const openPayables = data.openPayables || null;
  const paidThisMonth = data.paidThisMonth;
  // Con extraccion viva, el vencido sale de TODAS las facturas abiertas de SAP; si no
  // respondio, cae al aging (solo lineas de propuestas vivas).
  const overdueAmount = openPayables
    ? num(openPayables.vencido)
    : sumBy(aging, 'importe', (row) => row.bucket === 'vencido');
  const pendingProposals = sumBy(
    proposals,
    'total',
    (row) => row.status === 'PENDING_AUTH',
  );

  // Bloque de Cuentas por Pagar en vivo (extraccion SAP). Solo si la extraccion respondio.
  const cxpCards = openPayables ? [
    {
      id: 'cxp-total',
      title: 'Total por pagar',
      value: formatAmount(openPayables.total),
      icon: Wallet,
      category: 'health',
    },
    {
      id: 'cxp-7',
      title: 'Vence en 7 días',
      value: formatAmount(openPayables.proximo_7d),
      icon: CalendarClock,
      tone: num(openPayables.proximo_7d) > 0 ? 'warning' : 'neutral',
      category: 'action',
    },
    {
      id: 'cxp-15',
      title: 'Vence en 15 días',
      value: formatAmount(openPayables.proximo_15d),
      icon: CalendarClock,
      category: 'action',
    },
    {
      id: 'cxp-30',
      title: 'Vence en 30 días',
      value: formatAmount(openPayables.proximo_30d),
      icon: CalendarClock,
      category: 'action',
    },
  ] : [];

  const cxpCharts = openPayables ? [
    {
      id: 'cxp-projection',
      title: 'Salidas por vencer',
      subtitle: 'Importe por pagar (SAP) agrupado por mes de vencimiento.',
      data: (openPayables.byPeriod || []).map((row, index) => ({
        name: row.period,
        value: num(row.amount),
        color: row.period === 'Vencido' ? 'var(--color-error)' : categoricalColor(index),
      })),
      layout: 'vertical',
      valueName: 'Importe',
      formatValue: (value) => formatAmount(value),
    },
    {
      id: 'cxp-suppliers',
      title: 'Concentración de deuda',
      subtitle: 'Top 10 proveedores por saldo por pagar.',
      data: (openPayables.topSuppliers || []).map((row, index) => ({
        name: row.supplier,
        value: num(row.amount),
        color: categoricalColor(index),
      })),
      layout: 'vertical',
      valueName: 'Importe',
      formatValue: (value) => formatAmount(value),
    },
  ] : [];

  const agingRows = AGING_BUCKET_ORDER
    .map((bucket) => {
      const rows = aging.filter((row) => row.bucket === bucket);

      return {
        name: AGING_BUCKET_LABELS[bucket],
        value: sumBy(rows, 'importe'),
        lines: sumBy(rows, 'lineas'),
        color: AGING_BUCKET_COLORS[bucket],
      };
    })
    .filter((row) => row.lines > 0);

  const proposalRows = Object.keys(PROPOSAL_STATUS_LABELS)
    .map((status) => ({
      name: PROPOSAL_STATUS_LABELS[status],
      value: sumBy(proposals, 'total', (row) => row.status === status),
      color: PROPOSAL_STATUS_COLORS[status],
    }))
    .filter((row) => row.value > 0);

  return {
    title: 'Indicadores de pagos',
    cards: [
      ...cxpCards,
      {
        id: 'overdue',
        title: 'Importe vencido',
        value: formatAmount(overdueAmount),
        icon: CalendarX,
        tone: overdueAmount > 0 ? 'error' : 'success',
        linkText: 'Ir al workbench',
        linkHref: '/pagos',
        category: 'action',
      },
      {
        id: 'paid-month',
        title: 'Pagado este mes',
        value: formatAmount(paidThisMonth),
        icon: Banknote,
        category: 'health',
      },
      {
        id: 'pending',
        title: 'Propuestas por autorizar',
        value: formatCount(pendingProposals),
        icon: ClipboardCheck,
        tone: pendingProposals > 0 ? 'warning' : 'neutral',
        linkText: 'Ver seguimiento',
        linkHref: '/pagos/seguimiento',
        category: 'action',
      },
      {
        id: 'cfdi',
        title: 'Líneas sin CFDI',
        value: formatCount(compliance.sin_cfdi),
        icon: Receipt,
        tone: num(compliance.sin_cfdi) > 0 ? 'warning' : 'success',
        linkText: 'Ver comprobantes',
        linkHref: '/pagos/comprobantes',
        category: 'action',
      },
      {
        id: 'sap-error',
        title: 'Con error al registrar en SAP',
        value: formatCount(compliance.con_error_sap),
        icon: FileWarning,
        tone: num(compliance.con_error_sap) > 0 ? 'error' : 'success',
        category: 'action',
      },
      {
        id: 'reconciliation',
        title: 'Conciliaciones en curso',
        value: formatCount(reconciliation.en_curso),
        icon: Scale,
        tone: num(reconciliation.estancadas) > 0 ? 'warning' : 'neutral',
        linkText: 'Ir a conciliación',
        linkHref: '/pagos/conciliacion',
        category: 'health',
      },
      {
        id: 'stale-reconciliation',
        title: 'Conciliaciones estancadas',
        value: formatCount(reconciliation.estancadas),
        icon: TimerReset,
        tone: num(reconciliation.estancadas) > 0 ? 'error' : 'success',
        category: 'action',
      },
    ],
    charts: [
      ...cxpCharts,
      {
        id: 'aging',
        title: 'Importe por vencer',
        subtitle: 'Líneas incluidas de propuestas vivas, por antigüedad.',
        data: agingRows,
        layout: 'horizontal',
        valueName: 'Importe',
        formatValue: (value) => formatAmount(value),
      },
      {
        id: 'proposals',
        title: 'Propuestas por estado',
        subtitle: 'Embudo completo, desde la autorización hasta el cierre.',
        data: proposalRows,
        layout: 'horizontal',
        valueName: 'Propuestas',
        formatValue: (value) => formatCount(value),
      },
    ],
  };
}

/* ─── Compras internacionales ───────────────────────────────────────────── */

const ETA_STATUS_LABELS = {
  ETA_VENCIDA: 'ETA vencida',
  ETA_HOY: 'Llega hoy',
  ETA_PROXIMA: 'Próximos 7 días',
  ETA_FUTURA: 'Más adelante',
  SIN_ETA: 'Sin ETA',
};

const ETA_STATUS_COLORS = {
  ETA_VENCIDA: 'var(--color-error)',
  ETA_HOY: 'var(--color-warning)',
  ETA_PROXIMA: 'var(--color-info)',
  ETA_FUTURA: 'var(--color-success)',
  SIN_ETA: 'var(--color-muted-text)',
};

const ETA_STATUS_ORDER = ['ETA_VENCIDA', 'ETA_HOY', 'ETA_PROXIMA', 'ETA_FUTURA', 'SIN_ETA'];

/**
 * Cubetas de retraso de `v_dashboard_punctuality_web`. El orden es el de la
 * gráfica y los umbrales viven en el DDL de la vista, no aquí: estas claves solo
 * nombran columnas que ya vienen calculadas.
 *
 * Solo hay tres colores semánticos para cuatro pasos, así que `1-3` y `4-7`
 * comparten `warning` a propósito: los dos son «tarde pero manejable», y la
 * etiqueta del eje es la que los separa. Inventar un cuarto color rompería el
 * mapeo canónico de `rule-decisions.md`.
 */
const DELAY_BUCKETS = [
  { key: 'a_tiempo', label: 'A tiempo', color: 'var(--color-success)' },
  { key: 'retraso_1_3', label: '1 a 3 días', color: 'var(--color-warning)' },
  { key: 'retraso_4_7', label: '4 a 7 días', color: 'var(--color-warning)' },
  { key: 'retraso_mas_7', label: 'Más de 7 días', color: 'var(--color-error)' },
];

/** Un porcentaje de puntualidad a tono de tarjeta. */
function punctualityTone(pct) {
  if (pct === null || pct === undefined) return 'neutral';
  if (pct >= 85) return 'success';
  if (pct >= 60) return 'warning';
  return 'error';
}

/** Número con un decimal y unidad, o guion largo si el dato no existe. */
function formatDays(value) {
  return value === null || value === undefined ? '—' : `${round(value)} d`;
}

/** Porcentaje con un decimal, o guion largo. `0` es un dato, no una ausencia. */
function formatPercent(value) {
  return value === null || value === undefined ? '—' : `${round(value)} %`;
}

const SUPPLIER_PUNCTUALITY_COLUMNS = [
  { header: 'Proveedor', accessor: 'supplier_name' },
  { header: 'Embarques', accessor: 'total', cell: (row) => formatCount(row.total) },
  { header: 'Arribados', accessor: 'arribados', cell: (row) => formatCount(row.arribados) },
  {
    header: 'Contenedores',
    accessor: 'contenedores',
    cell: (row) => formatCount(row.contenedores),
  },
  {
    // Negativo es bueno: llegó antes de la ETA. Se marca con signo para que no
    // se lea como un retraso pequeño.
    header: 'Desviación',
    accessor: 'desviacion_dias',
    cell: (row) => (row.desviacion_dias === null || row.desviacion_dias === undefined
      ? '—'
      : `${num(row.desviacion_dias) > 0 ? '+' : ''}${round(row.desviacion_dias)} d`),
  },
  {
    header: 'A tiempo',
    accessor: 'pct_a_tiempo',
    // Sin embarques arribados con ETA no hay porcentaje que dar. Un `Badge` con
    // «0 %» ahí diría que el proveedor falla, cuando lo que pasa es que todavía
    // no hay con qué medirlo.
    cell: (row) => (row.pct_a_tiempo === null || row.pct_a_tiempo === undefined
      ? <span className="muted-text">Sin medir</span>
      : (
        <Badge variant={punctualityTone(num(row.pct_a_tiempo))}>
          {formatPercent(row.pct_a_tiempo)}
        </Badge>
      )),
  },
];

const PORT_VOLUME_COLUMNS = [
  {
    header: 'Puerto de descarga',
    accessor: 'pod_name',
    cell: (row) => row.pod_name || row.pod_locode || '—',
  },
  {
    // El LOCODE es la clave estable; el nombre lo escribe cada naviera a su
    // manera y puede variar entre payloads del mismo puerto.
    header: 'LOCODE',
    accessor: 'pod_locode',
    cell: (row) => <span className="data-text">{row.pod_locode || '—'}</span>,
  },
  { header: 'País', accessor: 'pod_country', cell: (row) => row.pod_country || '—' },
  { header: 'Embarques', accessor: 'total', cell: (row) => formatCount(row.total) },
  { header: 'Contenedores', accessor: 'contenedores', cell: (row) => formatCount(row.contenedores) },
  { header: 'Arribados', accessor: 'arribados', cell: (row) => formatCount(row.arribados) },
];

function buildInternationalPurchases(data) {
  const totals = data.totals || {};
  const etaBuckets = data.eta_buckets || [];
  const carriers = data.by_carrier || [];
  const punctuality = data.punctuality || {};
  const transit = data.transit || {};
  const quality = data.data_quality || {};
  const routes = data.routes || [];
  const mapPoints = data.map_points || [];
  const mapCoverage = data.map_coverage || {};

  const etaRows = ETA_STATUS_ORDER
    .map((status) => ({
      name: ETA_STATUS_LABELS[status],
      value: sumBy(etaBuckets, 'total', (row) => row.eta_status === status),
      color: ETA_STATUS_COLORS[status],
    }))
    .filter((row) => row.value > 0);

  // La naviera no tiene semántica de estado, así que aquí sí toca la paleta
  // categórica en vez de los tokens de color semántico.
  const carrierRows = carriers.map((row, index) => ({
    name: row.carrier,
    value: num(row.total),
    color: categoricalColor(index),
  }));

  // El retraso SÍ es una escala de estado: va con tokens semánticos. A
  // diferencia de las cubetas de ETA, no se filtran los ceros — un cero en «Más
  // de 7 días» es la buena noticia y esconderlo deforma la lectura.
  const delayRows = DELAY_BUCKETS.map((bucket) => ({
    name: bucket.label,
    value: num(punctuality[bucket.key]),
    color: bucket.color,
  }));

  const routeRows = routes.map((row, index) => ({
    name: row.corredor,
    value: num(row.total),
    color: categoricalColor(index),
  }));

  // Cobertura real de lo que sale del payload de SafeCube. `shipment_tracking_history`
  // solo recibe fila cuando una fecha cambia, así que un embarque que nunca se
  // movió no tiene ruta recuperable. Este par de cifras rotula las dos secciones
  // parciales; sin él, un «top corredores» se lee como si fuera el censo.
  const withRoute = num(quality.con_payload);
  const routeUniverse = num(quality.total);
  const routeCoverage = routeUniverse > 0
    ? `Sobre ${formatCount(withRoute)} de ${formatCount(routeUniverse)} embarques vigentes con ruta recuperable.`
    : 'Sin embarques vigentes que medir.';

  const measured = num(punctuality.medidos);
  const transitMeasured = num(transit.medidos);

  // Subtítulo del mapa. Confiesa dos cosas distintas y las dos importan:
  // cuántos embarques activos tienen posición, y de cuándo es la más vieja. Un
  // mapa sin eso se lee como «aquí están mis barcos ahora», y no lo es —el
  // tracking solo deja rastro cuando una fecha cambia, hasta que n8n escriba
  // `shipments.last_tracking_payload`.
  const mapPlotted = num(mapCoverage.con_posicion);
  const mapActive = num(mapCoverage.activos);
  const oldestPosition = mapPoints.reduce(
    (oldest, point) => Math.max(oldest, num(point.posicion_dias)),
    0,
  );
  const mapSubtitle = mapPlotted === 0
    ? 'Ningún embarque activo tiene posición conocida todavía.'
    : `Última posición conocida de ${formatCount(mapPlotted)} de ${formatCount(mapActive)} embarques activos`
      + `${oldestPosition > 0 ? `; la más antigua, de hace ${formatCount(oldestPosition)} días.` : '.'}`;

  // Problemas de tracking agrupados: los dos impiden que lleguen datos nuevos,
  // aunque por causas distintas —desactivado a mano frente a fallo del proveedor—.
  const trackingIssues = [
    num(quality.sin_tracking) > 0 ? `${formatCount(quality.sin_tracking)} sin tracking` : null,
    num(quality.con_error_tracking) > 0 ? `${formatCount(quality.con_error_tracking)} con error` : null,
  ].filter(Boolean).join(' · ');

  return {
    title: 'Indicadores de compras internacionales',
    cards: [
      {
        id: 'shipments',
        title: 'Embarques registrados',
        value: formatCount(totals.total_embarques),
        icon: Ship,
        linkText: 'Ver embarques',
        linkHref: '/international-purchases',
        category: 'health',
      },
      {
        id: 'containers',
        title: 'Contenedores',
        value: formatCount(totals.total_contenedores),
        icon: Container,
        category: 'health',
      },
      {
        id: 'eta-overdue',
        title: 'Con ETA vencida',
        value: formatCount(totals.eta_vencida),
        icon: CalendarX,
        tone: num(totals.eta_vencida) > 0 ? 'error' : 'success',
        category: 'action',
      },
      {
        id: 'eta-missing',
        title: 'Sin ETA',
        value: formatCount(totals.sin_eta),
        icon: CalendarClock,
        tone: num(totals.sin_eta) > 0 ? 'warning' : 'success',
        category: 'action',
      },
      {
        // Sustituye a la antigua tarjeta «Sin tracking activo», cuyo dato pasó
        // al pie de esta: los tres son el mismo problema —el embarque dejó de
        // recibir datos— y separarlos gastaba tres huecos de «Mi trabajo» en
        // una sola preocupación.
        id: 'stale-data',
        title: 'Sin actualizar (+24 h)',
        value: formatCount(quality.obsoletos),
        icon: Clock,
        tone: num(quality.obsoletos) > 0 ? 'warning' : 'success',
        trendValue: trackingIssues || undefined,
        category: 'action',
      },
      {
        id: 'pending-review',
        title: 'Pendientes de revisión',
        value: formatCount(quality.pendientes_revision),
        icon: ClipboardCheck,
        tone: num(quality.pendientes_revision) > 0 ? 'warning' : 'success',
        linkText: num(quality.pendientes_revision) > 0 ? 'Revisar embarques' : undefined,
        linkHref: num(quality.pendientes_revision) > 0 ? '/international-purchases' : undefined,
        category: 'action',
      },
      {
        id: 'on-time',
        title: 'Embarques a tiempo',
        value: formatPercent(punctuality.pct_a_tiempo),
        icon: CheckCircle2,
        tone: punctualityTone(
          punctuality.pct_a_tiempo === null || punctuality.pct_a_tiempo === undefined
            ? null
            : num(punctuality.pct_a_tiempo),
        ),
        // El denominador va en la tarjeta y no en una nota al pie: un 50 % sobre
        // dos embarques y un 50 % sobre doscientos no significan lo mismo.
        trendValue: measured > 0
          ? `${formatCount(measured)} arribados con ETA`
          : 'Sin arribos que medir',
        category: 'health',
      },
      {
        id: 'transit',
        title: 'Tránsito real medio',
        value: formatDays(transit.transito_promedio),
        icon: TimerReset,
        // La mediana acompaña al promedio porque con pocos embarques un solo
        // caso extremo mueve la media y la mediana no.
        trendValue: transitMeasured > 0
          ? `Mediana ${formatDays(transit.transito_mediana)} · ${formatCount(transitMeasured)} medidos`
          : 'Sin tránsitos completos',
        category: 'health',
      },
    ],
    charts: [
      {
        id: 'eta',
        title: 'Embarques por estado de ETA',
        subtitle: 'Calculado por la vista del proceso, no en el cliente.',
        data: etaRows,
        layout: 'horizontal',
        valueName: 'Embarques',
        formatValue: (value) => formatCount(value),
      },
      {
        id: 'punctuality',
        title: 'Puntualidad de los arribos',
        subtitle: measured > 0
          ? `Retraso medio ${formatDays(punctuality.retraso_promedio)}, mediana ${formatDays(punctuality.retraso_mediana)}.`
          : 'Todavía no hay embarques arribados con ETA para comparar.',
        data: delayRows,
        layout: 'horizontal',
        valueName: 'Embarques',
        formatValue: (value) => formatCount(value),
      },
      {
        id: 'carriers',
        title: 'Embarques por naviera',
        subtitle: 'Las ocho con más embarques.',
        data: carrierRows,
        layout: 'vertical',
        valueName: 'Embarques',
        formatValue: (value) => formatCount(value),
      },
      {
        id: 'routes',
        title: 'Corredores más usados',
        subtitle: routeCoverage,
        data: routeRows,
        layout: 'vertical',
        valueName: 'Embarques',
        formatValue: (value) => formatCount(value),
      },
    ],
    // Bloque opcional que el Dashboard pinta entre las gráficas y las tablas.
    // Solo compras internacionales lo devuelve hoy; el resto de procesos no
    // tiene coordenadas que mostrar y el Dashboard simplemente no pinta nada.
    map: {
      id: 'shipment-map',
      title: 'Ubicación de los embarques',
      subtitle: mapSubtitle,
      points: mapPoints,
      emptyMessage:
        'Ningún embarque en tránsito o planeado tiene coordenadas recuperables. '
        + 'La posición llega con el tracking, así que aparecerá tras la próxima corrida.',
    },
    tables: [
      {
        id: 'punctuality-by-supplier',
        title: 'Puntualidad por proveedor',
        subtitle: 'Los diez con más embarques. La desviación se mide solo sobre los ya arribados.',
        columns: SUPPLIER_PUNCTUALITY_COLUMNS,
        data: data.punctuality_by_supplier || [],
        emptyMessage: 'No hay embarques vigentes registrados.',
      },
      {
        id: 'by-port',
        title: 'Volumen por puerto de descarga',
        subtitle: routeCoverage,
        columns: PORT_VOLUME_COLUMNS,
        data: data.by_port || [],
        emptyMessage: 'Ningún embarque tiene todavía puerto de descarga recuperable.',
      },
    ],
  };
}

/* ─── Revaluaciones de material ─────────────────────────────────────────── */

function buildMaterialRevaluations(data) {
  const approvals = data.approvals || {};
  const executions = data.executions || {};

  const approvalRows = [
    {
      name: 'Pendientes',
      value: num(approvals.pendientes),
      color: 'var(--color-warning)',
    },
    {
      name: 'Aprobadas',
      value: num(approvals.aprobadas),
      color: 'var(--color-success)',
    },
    {
      name: 'Rechazadas',
      value: num(approvals.rechazadas),
      color: 'var(--color-error)',
    },
  ].filter((row) => row.value > 0);

  return {
    title: 'Indicadores de revaluaciones',
    cards: [
      {
        id: 'pending',
        title: 'Aprobaciones pendientes',
        value: formatCount(approvals.pendientes),
        icon: ClipboardCheck,
        tone: num(approvals.pendientes) > 0 ? 'warning' : 'success',
        linkText: 'Ir a revisión',
        linkHref: '/revaluaciones',
        category: 'action',
      },
      {
        id: 'stale',
        title: 'Esperando más de 24 h',
        value: formatCount(approvals.pendientes_mas_24h),
        icon: Clock,
        tone: num(approvals.pendientes_mas_24h) > 0 ? 'error' : 'success',
        category: 'action',
      },
      {
        id: 'median',
        title: 'Mediana de respuesta',
        value: formatDurationMs(approvals.p50_respuesta_ms),
        icon: TimerReset,
        category: 'health',
      },
      {
        id: 'executions',
        title: 'Ejecuciones con error',
        value: formatCount(executions.con_error),
        icon: FileWarning,
        tone: num(executions.con_error) > 0 ? 'error' : 'success',
        category: 'health',
      },
    ],
    charts: [
      {
        id: 'approvals',
        title: 'Aprobaciones por resultado',
        subtitle: 'Histórico completo del proceso.',
        data: approvalRows,
        layout: 'horizontal',
        valueName: 'Aprobaciones',
        formatValue: (value) => formatCount(value),
      },
    ],
  };
}

/* ─── Mantenimiento ──────────────────────────────────────────────────────── */

const MACHINE_STATUS_ROWS = [
  { key: 'operating', name: 'En operación', color: 'var(--color-success)' },
  { key: 'available', name: 'Disponibles', color: 'var(--color-info)' },
  { key: 'in_preventive', name: 'En preventivo', color: 'var(--color-warning)' },
  { key: 'in_repair', name: 'En reparación', color: 'var(--color-error)' },
];

/**
 * Heurística de negocio pendiente de validar con los responsables: cada paro
 * representa una ventana productiva de 8 h. Una máquina sin paros se considera
 * 100 % disponible (evita además la división por cero).
 *
 * Venía de la vista /mantenimiento/kpis, que la mostraba solo a los auditores.
 * Al absorberse en el Dashboard general gana visibilidad sin haber cambiado de
 * fundamento: sigue siendo una aproximación, no un dato medido.
 */
function getAvailability(machine) {
  const stops = num(machine.total_stops);
  if (stops <= 0) return 100;
  const productiveWindow = stops * 8;
  const uptime = productiveWindow - num(machine.total_downtime_hours);
  return Math.min(100, Math.max(0, (uptime / productiveWindow) * 100));
}

function round(value, decimals = 1) {
  const factor = 10 ** decimals;
  return Math.round(num(value) * factor) / factor;
}

/** Umbrales heredados de las barras de disponibilidad de /mantenimiento/kpis. */
function availabilityColor(availability) {
  if (availability >= 90) return 'var(--color-success)';
  if (availability >= 75) return 'var(--color-warning)';
  return 'var(--color-error)';
}

/** Criticidad de una máquina a variante de `Badge`, según `rule-decisions.md`. */
function criticalityVariant(criticality) {
  if (criticality === 'alta') return 'error';
  if (criticality === 'media') return 'warning';
  return 'info';
}

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString('es-MX') : '—';
}

const FAILURES_COLUMNS = [
  { header: 'Máquina', accessor: 'machine_name' },
  { header: 'Sucursal', accessor: 'branch_name' },
  { header: 'Motivo', accessor: 'reason' },
  { header: 'Inicio', accessor: 'stopped_at', cell: (row) => formatDate(row.stopped_at) },
  {
    header: 'Duración',
    accessor: 'duration_hours',
    cell: (row) => `${round(row.duration_hours)} h`,
  },
  {
    header: 'Refacciones',
    accessor: 'is_out_of_parts',
    // Antes era un icono suelto sin etiqueta: el estado solo se distinguía por
    // color y forma, y ningún lector de pantalla lo anunciaba.
    cell: (row) => (row.is_out_of_parts
      ? <Badge variant="warning">Sin refacciones</Badge>
      : <Badge variant="success">Con refacciones</Badge>),
  },
];

const OBSOLESCENCE_COLUMNS = [
  { header: 'Máquina', accessor: 'machine_name' },
  {
    header: 'Marca / Modelo',
    accessor: 'brand',
    cell: (row) => [row.brand, row.model].filter(Boolean).join(' / ') || '—',
  },
  { header: 'Serie', accessor: 'serial_number', cell: (row) => row.serial_number || '—' },
  { header: 'Sucursal', accessor: 'branch_name' },
  {
    header: 'Criticidad',
    accessor: 'criticality',
    cell: (row) => <Badge variant={criticalityVariant(row.criticality)}>{row.criticality}</Badge>,
  },
  { header: 'Paros', accessor: 'total_stops', cell: (row) => formatCount(row.total_stops) },
  {
    header: 'Horas de paro',
    accessor: 'total_downtime_hours',
    cell: (row) => `${round(row.total_downtime_hours)} h`,
  },
  { header: 'Correctivos', accessor: 'corrective_count', cell: (row) => formatCount(row.corrective_count) },
  { header: 'Preventivos', accessor: 'preventive_count', cell: (row) => formatCount(row.preventive_count) },
  {
    header: 'Última falla',
    accessor: 'last_failure_date',
    cell: (row) => (row.last_failure_date ? formatDate(row.last_failure_date) : 'Sin registro'),
  },
];

function buildMaintenance(data) {
  const summary = data.summary || {};
  const machines = data.machines || [];

  const downtimeHours = machines.reduce(
    (total, machine) => total + num(machine.total_downtime_hours),
    0,
  );
  const totalStops = machines.reduce(
    (total, machine) => total + num(machine.total_stops),
    0,
  );
  const avgAvailability = machines.length > 0
    ? machines.reduce((total, machine) => total + getAvailability(machine), 0) / machines.length
    : 0;

  const statusRows = MACHINE_STATUS_ROWS
    .map((row) => ({ name: row.name, value: num(summary[row.key]), color: row.color }))
    .filter((row) => row.value > 0);

  const availabilityRows = machines.map((machine) => {
    const availability = round(getAvailability(machine));

    return {
      name: machine.machine_name,
      value: availability,
      color: availabilityColor(availability),
    };
  });

  return {
    title: 'Indicadores de mantenimiento',
    cards: [
      {
        id: 'machines',
        title: 'Máquinas activas',
        value: formatCount(summary.total_machines),
        icon: Wrench,
        linkText: 'Ver mantenimiento',
        linkHref: '/mantenimiento',
        category: 'health',
      },
      {
        id: 'operating',
        title: 'Máquinas en operación',
        value: formatCount(summary.operating),
        icon: CheckCircle2,
        category: 'health',
      },
      {
        id: 'repair',
        title: 'En reparación',
        value: formatCount(summary.in_repair),
        icon: Wrench,
        tone: num(summary.in_repair) > 0 ? 'error' : 'success',
        category: 'action',
      },
      {
        id: 'out-of-parts',
        title: 'Sin refacciones',
        value: formatCount(summary.out_of_parts),
        icon: PackageCheck,
        tone: num(summary.out_of_parts) > 0 ? 'warning' : 'success',
        category: 'action',
      },
      {
        id: 'availability',
        title: 'Disponibilidad promedio',
        value: `${round(avgAvailability)} %`,
        icon: Activity,
        category: 'health',
      },
      {
        id: 'downtime',
        title: 'Horas de paro acumuladas',
        value: `${formatCount(Math.round(downtimeHours))} h`,
        icon: Clock,
        category: 'health',
      },
      {
        id: 'stops',
        title: 'Total de intervenciones',
        value: formatCount(totalStops),
        icon: Wrench,
        category: 'health',
      },
    ],
    charts: [
      {
        id: 'machine-status',
        title: 'Máquinas por estado',
        subtitle: 'Situación actual del parque activo.',
        data: statusRows,
        layout: 'horizontal',
        valueName: 'Máquinas',
        formatValue: (value) => formatCount(value),
      },
      {
        id: 'machine-availability',
        title: 'Disponibilidad por máquina',
        subtitle: 'Verde ≥ 90 %, ámbar ≥ 75 %, rojo por debajo.',
        data: availabilityRows,
        layout: 'vertical',
        valueName: 'Disponibilidad',
        formatValue: (value) => `${value} %`,
      },
    ],
    tables: [
      {
        id: 'failures-history',
        title: 'Historial de fallas',
        subtitle: 'Últimos 20 paros con reanudación registrada.',
        columns: FAILURES_COLUMNS,
        data: data.failures || [],
        emptyMessage: 'No hay paros con reanudación registrada.',
      },
      {
        id: 'obsolescence',
        title: 'Análisis de obsolescencia',
        subtitle: 'Maquinaria con mayor tiempo de paro y frecuencia de fallas, para evaluar reemplazo.',
        columns: OBSOLESCENCE_COLUMNS,
        data: data.obsolescence || [],
        emptyMessage: 'No hay máquinas activas que analizar.',
      },
    ],
  };
}

const BUILDERS = {
  payments: buildPayments,
  international_purchases: buildInternationalPurchases,
  material_revaluation: buildMaterialRevaluations,
  maintenance: buildMaintenance,
};

/**
 * @param {string} processCode - Código del proceso seleccionado.
 * @param {object} data - `data` de la respuesta del endpoint de ese proceso.
 * @returns {{title: string, cards: object[], charts: object[], tables?: object[]}|null}
 *   `cards[].category` es `'action'` (requiere que alguien haga algo: una cola,
 *   un pendiente con acción clara — va en la zona "Mi trabajo" del Dashboard) o
 *   `'health'` (diagnóstico/conteo informativo, sin acción directa — va en
 *   "Salud del proceso"). `cards` alimenta `DataCard`; `charts`, el `renderCategoryChart` del Dashboard
 *   (barras de una serie, `layout` `horizontal|vertical`); `tables` es opcional y
 *   cada entrada —`{id, title, subtitle, columns, data, emptyMessage}`— se pinta
 *   con `DataTable`, cuyo descriptor de columnas se pasa tal cual.
 *
 *   `map` también es opcional —`{id, title, subtitle, points, emptyMessage}`— y
 *   se pinta con `ShipmentMap` entre las gráficas y las tablas. Hoy solo lo
 *   devuelve compras internacionales: es el único proceso con coordenadas.
 */
export function buildProcessKpis(processCode, data) {
  const builder = BUILDERS[processCode];

  if (!builder || !data) {
    return null;
  }

  return builder(data);
}
