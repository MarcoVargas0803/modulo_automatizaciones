// Parsea un entero positivo (base 10) o devuelve null. Fuente unica de una funcion
// que existia identica bajo tres nombres de dominio (parseUserId, parsePositiveId,
// parseApprovalId). Cada modulo la reexporta con su nombre local por legibilidad.
function parsePositiveInt(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

module.exports = {
  parsePositiveInt,
};
