const env = require("../config/env");

function buildWebhookHeaders() {
  const headers = { "Content-Type": "application/json" };
  const { webhookAuthHeader, webhookAuthToken } = env.n8n;

  if (webhookAuthToken) {
    headers[webhookAuthHeader] = webhookAuthToken;
  }

  return headers;
}

function buildWebhookErrorMessage(errorMessage, response) {
  return `${errorMessage}. Status n8n: ${response.status}.`;
}

// Contrato estructurado n8n -> backend (Fase 6B.3 / Grupo B). Devuelve el bloque
// `operation` normalizado si la respuesta lo trae; null si n8n aun responde con el
// contrato antiguo (texto / {success}). Forward-compatible: no rompe nada hoy.
function extractOperation(responseText) {
  if (!responseText) {
    return null;
  }
  try {
    const parsed = JSON.parse(responseText);
    const op = parsed && typeof parsed === "object" ? parsed.operation : null;
    if (!op || typeof op !== "object") {
      return null;
    }
    return {
      type: op.type ?? null,
      status: op.status ?? null,
      sapDocEntry: op.sapDocEntry ?? null,
      idempotencyKey: op.idempotencyKey ?? null,
      correlationId: op.correlationId ?? null,
      n8nExecutionId: op.n8nExecutionId ?? null,
      errorCode: parsed.error?.code ?? null,
      errorMessage: parsed.error?.message ?? null,
    };
  } catch {
    // Respuesta no-JSON (contrato actual): sin bloque operation.
    return null;
  }
}

// El cuerpo que devuelve n8n puede traer errores de SAP, rutas internas o credenciales.
// En produccion solo viaja al navegador lo minimo para que el operador sepa que paso.
function publicWorkflowResult(result) {
  if (!result || env.nodeEnv !== "production") {
    return result;
  }

  return {
    ok: result.ok,
    skipped: result.skipped,
    status: result.status,
    message: result.message,
  };
}

async function postWebhook(
  webhookUrl,
  payload,
  {
    skippedMessage,
    errorMessage,
    successMessage = "Solicitud enviada con exito",
    timeoutMessage = "Timeout al activar workflow",
    timeoutMs = env.n8n.webhookTimeoutMs,
  } = {},
) {
  if (!webhookUrl) {
    return {
      ok: false,
      skipped: true,
      message: skippedMessage,
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: buildWebhookHeaders(),
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const responseText = await response.text();

    return {
      ok: response.ok,
      status: response.status,
      response: responseText || null,
      responsePreview: responseText ? responseText.slice(0, 500) : null,
      operation: extractOperation(responseText),
      message: response.ok
        ? successMessage
        : buildWebhookErrorMessage(errorMessage, response),
    };
  } catch (error) {
    // "fetch failed" a secas no dice nada: la causa real (ECONNREFUSED, ENOTFOUND, cert)
    // vive en error.cause y es lo que apunta a un webhook mal configurado o inalcanzable.
    const cause = error.cause?.code || error.cause?.message;
    return {
      ok: false,
      status: error.name === "AbortError" ? 504 : null,
      response: null,
      message: error.name === "AbortError"
        ? timeoutMessage
        : `${error.message}${cause ? ` (${cause})` : ""}`,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function triggerInternationalPurchasesTracking(payload) {
  return postWebhook(env.n8n.internationalPurchasesWebhookUrl, payload, {
    skippedMessage: "No se configuro N8N_INTERNATIONAL_PURCHASES_WEBHOOK_URL",
    errorMessage: "n8n respondio con error al activar tracking",
    successMessage: "Actualizacion solicitada con exito",
    timeoutMessage: "Timeout al activar workflow de tracking",
  });
}

async function triggerMaterialRevaluationSend(payload) {
  return postWebhook(env.n8n.materialRevaluationWebhookUrl, payload, {
    skippedMessage: "El envio automatico a SAP no esta disponible en este momento.",
    errorMessage: "El servicio de envio a SAP respondio con error",
  });
}

// Envia por correo el enlace de registro a un forwarder. El workflow responde
// tres codigos distintos a proposito (200 enviado, 502 fallo de SMTP, 400 datos
// invalidos) para poder distinguir "el correo salio" de "n8n lo recibio pero no
// pudo enviarlo": en el segundo caso el enlace SI existe y hay que entregarlo a
// mano, no reemitirlo.
//
// OJO: el payload lleva la URL con el token EN CLARO. El workflow debe conservar
// saveDataSuccessExecution: "none" o esa credencial de escritura queda guardada
// en el historial de ejecuciones de n8n.
async function triggerForwarderInvite(payload) {
  const result = await postWebhook(env.n8n.forwarderInviteWebhookUrl, payload, {
    skippedMessage:
      "El envio automatico del enlace no esta configurado. Copie el enlace y entreguelo manualmente.",
    errorMessage: "El servicio de correo respondio con error al enviar el enlace",
    successMessage: "Enlace enviado por correo con exito",
    timeoutMessage: "Timeout al enviar el enlace por correo",
  });

  if (!result.ok) {
    return { ...result, notified: false };
  }

  // El workflow responde { success, notified }. Si no se puede interpretar, se
  // trata como no notificado: es preferible que el operador entregue el enlace
  // a mano de mas que dar por enviado un correo que nunca salio.
  let parsedResponse = null;

  try {
    parsedResponse = JSON.parse(result.response || "{}");
  } catch {
    return {
      ...result,
      notified: false,
      message: "n8n devolvio una respuesta que no es JSON valido",
    };
  }

  return {
    ...result,
    parsedResponse,
    notified: parsedResponse.notified === true,
  };
}

module.exports = {
  triggerInternationalPurchasesTracking,
  triggerForwarderInvite,
  triggerMaterialRevaluationSend,
  buildWebhookHeaders,
  publicWorkflowResult,
  extractOperation,
};
