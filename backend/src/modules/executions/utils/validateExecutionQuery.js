const allowedStatuses = ["EXITOSA", "ERROR", "EN PROCESO", "INCOMPLETA"];
const allowedSortOrders = ["newest", "oldest"];

function isValidDate(value) {
  if (!value) {
    return true;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function validateExecutionQuery(query) {
  const errors = [];

  if (query.status && !allowedStatuses.includes(query.status)) {
    errors.push(
      `El filtro status debe ser uno de: ${allowedStatuses.join(", ")}`,
    );
  }

  if (query.processCode && !/^[a-zA-Z0-9_-]+$/.test(query.processCode)) {
    errors.push(
      "El filtro processCode solo puede contener letras, números, guiones y guiones bajos",
    );
  }

  if (query.dateFrom && !isValidDate(query.dateFrom)) {
    errors.push("El filtro dateFrom debe tener formato YYYY-MM-DD");
  }

  if (query.dateTo && !isValidDate(query.dateTo)) {
    errors.push("El filtro dateTo debe tener formato YYYY-MM-DD");
  }

  if (query.dateFrom && query.dateTo) {
    const dateFrom = new Date(`${query.dateFrom}T00:00:00Z`);
    const dateTo = new Date(`${query.dateTo}T00:00:00Z`);

    if (dateFrom > dateTo) {
      errors.push("dateFrom no puede ser mayor que dateTo");
    }
  }

  if (query.search && query.search.length > 100) {
    errors.push("El filtro search no puede superar los 100 caracteres");
  }

  if (query.sortOrder && !allowedSortOrders.includes(query.sortOrder)) {
    errors.push(
      `El filtro sortOrder debe ser uno de: ${allowedSortOrders.join(", ")}`,
    );
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

module.exports = {
  validateExecutionQuery,
};