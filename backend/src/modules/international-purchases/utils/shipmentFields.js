// Helpers de limpieza y normalizacion de los campos de un embarque.
//
// Vivian dentro de international-purchases.routes.js. Se mueven aqui porque el
// router publico —el que usa el forwarder sin sesion— necesita exactamente las
// mismas reglas: si se copiaran, el alta externa y la interna podrian divergir
// en como recortan un espacio o como pasan a mayusculas una referencia, y esa
// divergencia solo se notaria al quedar dos filas que deberian ser la misma.
//
// No suben a shared/ a proposito: solo los usa este modulo (ver la regla unica
// de decision en .claude/conventions/architecture.md).

const MAX_CUSTOM_FIELDS = 20;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cleanText(value) {
  if (value === undefined || value === null) return null;

  const text = String(value).trim();

  return text === "" ? null : text;
}

function normalizeUpper(value) {
  const text = cleanText(value);

  return text ? text.toUpperCase() : null;
}

// La referencia se compara contra un UNIQUE (shipments_tracking_key_unique), asi
// que los espacios interiores importan: "MSCU 123" y "MSCU123" serian dos filas
// distintas para la base pero el mismo MBL para el operador. Por eso se quitan.
function normalizeTrackingKey(value) {
  const text = cleanText(value);

  if (!text) return null;

  return text.toUpperCase().replace(/\s+/g, "");
}

function normalizeScac(value) {
  const text = cleanText(value);

  if (!text) return null;

  return text.toUpperCase().replace(/\s+/g, "");
}

function toInteger(value) {
  const text = cleanText(value);

  if (text === null) return null;

  const parsed = parseInt(text, 10);

  return Number.isNaN(parsed) ? null : parsed;
}

// Recorta a MAX_CUSTOM_FIELDS entradas con label y value acotados. Es la unica
// barrera entre lo que teclea el forwarder y una columna jsonb: sin ella, un
// cliente puede mandar un arreglo arbitrariamente grande.
function sanitizeCustomFields(raw) {
  if (!Array.isArray(raw)) return [];

  const result = [];

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;

    const label = cleanText(item.label);
    if (!label) continue;

    const value = cleanText(item.value);

    result.push({
      label: label.slice(0, 60),
      value: value ? value.slice(0, 500) : "",
    });

    if (result.length >= MAX_CUSTOM_FIELDS) break;
  }

  return result;
}

module.exports = {
  MAX_CUSTOM_FIELDS,
  UUID_REGEX,
  cleanText,
  normalizeUpper,
  normalizeTrackingKey,
  normalizeScac,
  toInteger,
  sanitizeCustomFields,
};
