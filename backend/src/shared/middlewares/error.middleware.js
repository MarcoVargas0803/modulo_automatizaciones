const { buildErrorResponse } = require("../utils/errorResponse");

function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    message: "Ruta no encontrada",
  });
}

// Sin esto, un JSON malformado o un cuerpo demasiado grande respondian 500 y no
// dejaban rastro en el servidor. Express ya marca esos errores con su status.
function globalErrorHandler(error, req, res, next) {
  console.error(`[${req.method} ${req.originalUrl}]`, error);

  const status = Number.isInteger(error.status) ? error.status : 500;
  const message =
    status >= 500 ? "Error interno del servidor" : error.message || "Solicitud invalida";

  // `log: false` porque el console.error de arriba ya registro este mismo error
  // CON metodo y URL, contexto que buildErrorResponse no puede conocer (no ve el
  // request). Sin esto, cada error de nivel Express dejaria dos lineas iguales.
  res.status(status).json(buildErrorResponse(message, error, { log: false }));
}

module.exports = {
  notFoundHandler,
  globalErrorHandler,
};
