export function formatDate(value) {
  if (!value) return '-';

  const dateText = String(value).slice(0, 10);
  const [year, month, day] = dateText.split('-');

  if (!year || !month || !day) {
    return '-';
  }

  const date = new Date(year, month - 1, day);
  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(date);
}

export function formatDateTime(value) {
  if (!value) return '-';

  return new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Mexico_City',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function formatRelativeTime(value) {
  if (!value) return '-';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';

  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.round(diffMs / 60000);

  if (diffMin < 1) return 'hace instantes';
  if (diffMin < 60) return `hace ${diffMin} min`;

  const diffHours = Math.round(diffMin / 60);
  if (diffHours < 24) return `hace ${diffHours} h`;

  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 30) return `hace ${diffDays} d`;

  return formatDateTime(value);
}

export function trackingErrorText(error) {
  if (!error) return '';

  const code = error.errorCode ? `[${error.errorCode}] ` : '';
  const detail = Array.isArray(error.details) ? error.details.join(' ') : '';

  return `${code}${error.message || 'Error de tracking'}${detail ? ` — ${detail}` : ''}`.trim();
}
