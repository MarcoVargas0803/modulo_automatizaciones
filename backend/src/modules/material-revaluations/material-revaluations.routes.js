const crypto = require("crypto");
const express = require("express");
const pool = require("../../shared/db/pool");
const env = require("../../shared/config/env");
const { requireAuth } = require("../../shared/middlewares/auth.middleware");
const { requireCsrf, safeCompare } = require("../../shared/middlewares/csrf.middleware");
const { requireProcess } = require("../../shared/middlewares/access.middleware");
const {
  revaluationActionLimiter,
  n8nNotifyLimiter,
} = require("../../shared/middlewares/rate-limit.middleware");
const { buildErrorResponse } = require("../../shared/utils/errorResponse");
const { logActivity } = require("../../shared/utils/activityLog");
const { toNumber } = require("../../shared/utils/toNumber");
const { parsePositiveInt } = require("../../shared/utils/parsePositiveInt");
const {
  triggerMaterialRevaluationSend,
  publicWorkflowResult,
} = require("../../shared/services/n8n.service");
const {
  addClient,
  removeClient,
  broadcast,
} = require("./services/revaluationEvents");

const router = express.Router();

const PROCESS_CODE = "material_revaluation";
const ALLOWED_PRORATION_TYPES = ["piece", "cost", "volume", "mixed"];
const requireMaterialRevaluationUser = requireProcess(PROCESS_CODE, { denyAuditorWrite: true });

function requireN8nToken(req, res, next) {
  const expected = env.n8n.webhookAuthToken;

  if (!expected) {
    return res.status(503).json({
      success: false,
      message: "N8N_WEBHOOK_AUTH_TOKEN no esta configurado",
    });
  }

  const provided = req.get(env.n8n.webhookAuthHeader);

  if (!provided || !safeCompare(provided, expected)) {
    return res.status(403).json({
      success: false,
      message: "Token de webhook invalido o ausente",
    });
  }

  return next();
}

function firstValue(source, keys, fallback = null) {
  for (const key of keys) {
    if (source && source[key] !== undefined && source[key] !== null) {
      return source[key];
    }
  }

  return fallback;
}

async function getExecutionAccess(userId, executionId) {
  const result = await pool.query(
    `SELECT
      v.execution_id,
      v.process_code,
      v.process_name,
      v.source_reference,
      upa.can_export
    FROM audit_portal.v_execution_dashboard_web v
    INNER JOIN audit_portal.v_user_process_access_effective upa
      ON upa.process_code = v.process_code
    WHERE v.execution_id = $1
      AND upa.user_id = $2
      AND v.process_code = $3
    LIMIT 1;`,
    [executionId, userId, PROCESS_CODE],
  );

  return result.rows[0] || null;
}

async function getReviewPayload(executionId) {
  
  const result = await pool.query(
    `SELECT payload
       FROM material_revaluations.v_review_web
      WHERE execution_id = $1
      ORDER BY priority ASC, created_at DESC
      LIMIT 1;`,
    [executionId],
  );

  return result.rows[0]?.payload || null;
}

async function getPendingReviewRows(userId) {
  
  const result = await pool.query(
    `SELECT
      p.execution_id,
      p.process_code,
      p.process_name,
      p.source_reference,
      p.created_at_mx,
      p.approval_id,
      p.requested_at,
      EXTRACT(EPOCH FROM ((now() AT TIME ZONE 'America/Mexico_City') - p.requested_at))::BIGINT AS waiting_seconds,
      p.requested_to,
      p.request_payload,
      upa.can_export
    FROM material_revaluations.v_pending_web p
    INNER JOIN audit_portal.v_user_process_access_effective upa
      ON upa.process_code = p.process_code
    WHERE upa.user_id = $1
    ORDER BY p.requested_at ASC, p.created_at_mx ASC;`,
    [userId],
  );

  return result.rows;
}

function normalizeReviewPayload(payload) {
  const source = payload || {};
  const revaluations = Array.isArray(source.revaluaciones)
    ? source.revaluaciones
    : Array.isArray(source.data?.revaluaciones)
      ? source.data.revaluaciones
      : [source];

  const lines = [];

  for (const revaluation of revaluations) {
    const products = Array.isArray(revaluation.productosRevaluados)
      ? revaluation.productosRevaluados
      : [];

    for (const [index, product] of products.entries()) {
      const transferQuantity = toNumber(
        firstValue(product, [
          "TransferQuantity",
          "transferQuantity",
          "CantidadTraspaso",
          "cantidad_traspaso",
        ]),
      );
      const currentCost = toNumber(
        firstValue(product, ["PrecioUnitario", "currentCost", "CostoActualSAP"]),
      );
      const volume = toNumber(
        firstValue(product, [
          "VolumenUnitario",
          "Volume",
          "volume",
          "Volumen",
          "U_Volumen",
        ]),
      );

      lines.push({
        rowNumber: lines.length + 1,
        sourceIndex: index,
        itemCode: firstValue(product, ["ItemCode", "itemCode"], ""),
        itemDescription: firstValue(
          product,
          ["ItemDescription", "itemDescription", "Dscription"],
          "",
        ),
        warehouseCode: firstValue(product, ["WarehouseCode", "warehouseCode"], ""),
        transferQuantity,
        stockActualSap: toNumber(
          firstValue(product, ["StockActualSAP", "stockActualSap"]),
        ),
        currentCost,
        volume,
        currentRevaluatedCost: toNumber(
          firstValue(product, ["PrecioRevaluado", "currentRevaluatedCost"]),
        ),
        currentFreightAssigned: toNumber(
          firstValue(product, ["FleteAsignado", "currentFreightAssigned"]),
        ),
        distributionRule: firstValue(
          product,
          ["DistributionRule", "distributionRule"],
          null,
        ),
        project: firstValue(product, ["Project", "project"], null),
        raw: product,
        docNum: firstValue(revaluation, ["DocNum", "docNum"], null),
      });
    }
  }

  const base = revaluations[0] || source;

  const requesterEmailKeys = [
    "from",
    "solicitante_email",
    "requester_email",
    "correo_solicitante",
    "email_solicitante",
    "solicitante",
  ];

  return {
    requestId: firstValue(base, ["request_id", "requestId"], null),
    requesterEmail:
      firstValue(base, requesterEmailKeys, null) ||
      firstValue(source, requesterEmailKeys, null),
    docNum: firstValue(base, ["DocNum", "docNum"], null),
    docNums: firstValue(base, ["DocNums", "docNums"], []),
    freightFolio: firstValue(base, ["folio_flete", "freightFolio"], null),
    carrierName: firstValue(base, ["nombre_emisor", "carrierName"], null),
    freightCost: toNumber(firstValue(base, ["costoFlete", "freightCost"])),
    accountCode: firstValue(base, ["cuenta_contable", "accountCode"], null),
    baseDocumentType: firstValue(
      base,
      ["documento_base_tipo", "baseDocumentType"],
      null,
    ),
    baseDocumentNumber: firstValue(
      base,
      ["documento_base_numero", "baseDocumentNumber"],
      null,
    ),
    audit: base.auditoria || source.auditoria || null,
    lines,
    raw: source,
  };
}

router.get(
  "/material-revaluations/pending",
  requireAuth,
  requireMaterialRevaluationUser,
  async (req, res) => {
  try {
    const rows = await getPendingReviewRows(req.user.userId);

    return res.json({
      success: true,
      data: rows.map((row) => ({
        execution: {
          execution_id: row.execution_id,
          process_code: row.process_code,
          process_name: row.process_name,
          source_reference: row.source_reference,
          created_at_mx: row.created_at_mx,
          can_export: row.can_export,
        },
        approval: {
          id: row.approval_id,
          requested_at: row.requested_at,
          waiting_seconds: Number(row.waiting_seconds),
          requested_to: row.requested_to,
        },
        review: normalizeReviewPayload(row.request_payload),
      })),
    });
  } catch (error) {
    return res
      .status(500)
      .json(
        buildErrorResponse(
          "Error al consultar revaluaciones pendientes",
          error,
        ),
      );
  }
  },
);

const parseApprovalId = parsePositiveInt;

async function markApprovalResolved({
  approvalId,
  executionId,
  status,
  approved,
  comments,
}) {
  const setClause = `SET approval_status = $2,
        approved = $3,
        approved_by = 'PORTAL',
        responded_at = NOW(),
        approval_date = NOW(),
        comments = $4,
        updated_at = NOW()`;

  if (approvalId) {
    const result = await pool.query(
      `UPDATE audit.workflow_approvals
       ${setClause}
       WHERE id = $1
         AND approval_status = 'PENDING'
       RETURNING id;`,
      [approvalId, status, approved, comments],
    );

    if (result.rowCount > 0) {
      return result.rowCount;
    }
  }

  if (!executionId) {
    return 0;
  }

  const result = await pool.query(
    `UPDATE audit.workflow_approvals
     ${setClause}
     WHERE execution_id::TEXT = $1::TEXT
       AND approval_status = 'PENDING'
     RETURNING id;`,
    [executionId, status, approved, comments],
  );

  return result.rowCount;
}

async function setRevaluationSapStatus({
  approvalId,
  executionId,
  status,
  idempotencyKey = null,
  correlationId = null,
  n8nExecutionId = null,
  docEntry = null,
  errorCode = null,
  errorMessage = null,
  onlyFromProcessing = false,
}) {
  const guard = onlyFromProcessing ? "AND sap_status = 'PROCESSING'" : "";
  const setClause = `SET sap_status = $2,
        sap_idempotency_key = COALESCE($3, sap_idempotency_key),
        sap_correlation_id = COALESCE($4, sap_correlation_id),
        sap_n8n_execution_id = COALESCE($5, sap_n8n_execution_id),
        sap_doc_entry = COALESCE($6, sap_doc_entry),
        sap_error_code = $7,
        sap_error_message = $8,
        updated_at = NOW()`;
  const params = [null, status, idempotencyKey, correlationId, n8nExecutionId, docEntry, errorCode, errorMessage];

  try {
    if (approvalId) {
      params[0] = approvalId;
      const r = await pool.query(
        `UPDATE audit.workflow_approvals ${setClause} WHERE id = $1 ${guard} RETURNING id;`,
        params,
      );
      if (r.rowCount > 0) {
        return r.rowCount;
      }
    }

    if (!executionId) {
      return 0;
    }

    params[0] = executionId;
    const r = await pool.query(
      `UPDATE audit.workflow_approvals ${setClause} WHERE execution_id::TEXT = $1::TEXT ${guard} RETURNING id;`,
      params,
    );
    return r.rowCount;
  } catch (error) {
    console.error("No se pudo actualizar sap_status de la revaluacion:", error.message);
    return 0;
  }
}

async function failWithSapUncertain(
  req,
  res,
  { approvalId, executionId, workflowResult, httpStatus },
) {
  const uncertain = !workflowResult.skipped;
  const status = uncertain ? "UNKNOWN" : "RETRYABLE";

  await setRevaluationSapStatus({
    approvalId,
    executionId,
    status,
    errorCode: uncertain ? "REMOTE_RESULT_UNKNOWN" : "WORKFLOW_SKIPPED",
    errorMessage: workflowResult.message,
    onlyFromProcessing: true,
  });

  await logActivity(req, {
    action: uncertain ? "revaluation.send_unknown" : "revaluation.send_skipped",
    entityType: "material_revaluation",
    entityId: executionId,
    detail: { approvalId, sapStatus: status, workflowMessage: workflowResult.message },
  });

  return res.status(httpStatus).json({
    success: false,
    requiresManualCheck: uncertain,
    sapStatus: status,
    message: uncertain
      ? `El envio a SAP no se pudo confirmar (resultado desconocido). NO la reintentes: la revaluacion quedo aprobada y podria haberse creado en SAP. Avisa a sistemas para revisar la ejecucion ${executionId}.`
      : workflowResult.message,
    workflowResult: publicWorkflowResult(workflowResult),
  });
}

async function handleApproveReview(req, res) {
  try {
    const { executionId } = req.params;
    const access = await getExecutionAccess(req.user.userId, executionId);

    if (!access) {
      return res.status(404).json({
        success: false,
        message: "Revaluacion no encontrada o sin permisos de acceso",
      });
    }

    if (!access.can_export) {
      return res.status(403).json({
        success: false,
        message: "El usuario no tiene permisos para enviar revaluaciones",
      });
    }

    const prorationType = String(req.body?.prorationType || "").trim();
    const lines = Array.isArray(req.body?.lines) ? req.body.lines : [];

    if (!ALLOWED_PRORATION_TYPES.includes(prorationType)) {
      return res.status(400).json({
        success: false,
        message: "Tipo de prorrateo invalido",
      });
    }

    if (lines.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No se recibieron lineas revisadas para enviar a SAP",
      });
    }

    // Una revaluacion de flete solo puede aumentar el costo: rechazamos si el costo nuevo
    // capturado es menor al actual (evita desplomar el costo del inventario en SAP).
    const decreasingLine = lines.find((line) => {
      const current = Number(line?.currentCost);
      const revalued = Number(line?.revaluatedCost);
      return (
        Number.isFinite(current) &&
        Number.isFinite(revalued) &&
        revalued < current - 0.005
      );
    });

    if (decreasingLine) {
      return res.status(400).json({
        success: false,
        message:
          "El costo nuevo no puede ser menor al costo actual en una revaluación de flete. Revisa las líneas capturadas.",
      });
    }

    const approvalId = parseApprovalId(req.body?.approvalId);

    const reserved = await markApprovalResolved({
      approvalId,
      executionId,
      status: "APPROVED",
      approved: true,
      comments: "Revision aprobada desde el portal y enviada a SAP.",
    });

    if (reserved === 0) {
      return res.status(409).json({
        success: false,
        message: "La revaluacion ya fue procesada previamente.",
      });
    }

    // Reserva de escritura SAP: PROCESSING antes de tocar n8n. idempotencyKey estable
    // por intencion de negocio; correlationId por intento (trazabilidad).
    const idempotencyKey = `material-revaluation:${approvalId ?? executionId}`;
    const correlationId = crypto.randomUUID();
    await setRevaluationSapStatus({
      approvalId,
      executionId,
      status: "PROCESSING",
      idempotencyKey,
      correlationId,
    });

    const workflowResult = await triggerMaterialRevaluationSend({
      // Contrato estructurado (Grupo B): identidad de operacion junto a los campos
      // actuales. Aditivo: el workflow vigente ignora `operation`.
      operation: {
        type: "MATERIAL_REVALUATION",
        idempotencyKey,
        correlationId,
        businessReference: { approvalId, executionId },
      },
      trigger: "portal_material_revaluation_decision",
      source: "portal",
      decision: "approved",
      requestedAt: new Date().toISOString(),
      executionId,
      prorationType,
      totals: req.body?.totals || null,
      metadata: req.body?.metadata || null,
      lines,
      requestedBy: {
        userId: req.user.userId,
        username: req.user.username,
        displayName: req.user.displayName,
        email: req.user.email,
      },
    });

    if (workflowResult.skipped || !workflowResult.ok) {
      return failWithSapUncertain(req, res, {
        approvalId,
        executionId,
        workflowResult,
        httpStatus: workflowResult.skipped ? 503 : 502,
      });
    }

    const op = workflowResult.operation;
    if (op && op.status) {
      if (op.status === "SUCCEEDED") {
        await setRevaluationSapStatus({
          approvalId, executionId, status: "SUCCEEDED",
          docEntry: op.sapDocEntry ?? null, n8nExecutionId: op.n8nExecutionId ?? null,
          onlyFromProcessing: true,
        });
        await logActivity(req, {
          action: "revaluation.approved", entityType: "material_revaluation",
          entityId: executionId, detail: { approvalId, prorationType, lineCount: lines.length },
        });
        return res.json({
          success: true, message: "Revaluacion aprobada y enviada a SAP.",
          approvalResolved: true, sapStatus: "SUCCEEDED", sapDocEntry: op.sapDocEntry ?? null,
          workflowResult: publicWorkflowResult(workflowResult),
        });
      }
      const status = op.status === "FAILED" ? "FAILED" : "UNKNOWN";
      await setRevaluationSapStatus({
        approvalId, executionId, status,
        n8nExecutionId: op.n8nExecutionId, errorCode: op.errorCode, errorMessage: op.errorMessage,
        onlyFromProcessing: true,
      });
      return res.status(status === "FAILED" ? 422 : 502).json({
        success: false, requiresManualCheck: status === "UNKNOWN", sapStatus: status,
        message: op.errorMessage || "El envio a SAP no se pudo confirmar.",
        workflowResult: publicWorkflowResult(workflowResult),
      });
    }

    await logActivity(req, {
      action: "revaluation.sent",
      entityType: "material_revaluation",
      entityId: executionId,
      detail: { approvalId, prorationType, lineCount: lines.length },
    });

    return res.json({
      success: true,
      message: "Revaluacion enviada a SAP; en proceso de registro.",
      approvalResolved: true,
      sapStatus: "PROCESSING",
      workflowResult: publicWorkflowResult(workflowResult),
    });
  } catch (error) {
    console.error("Error al enviar revaluacion a SAP:", error);
    return res
      .status(500)
      .json(buildErrorResponse("Error al enviar revaluacion a SAP", error));
  }
}

router.post(
  "/material-revaluations/:executionId/approve",
  requireAuth,
  requireMaterialRevaluationUser,
  requireCsrf,
  revaluationActionLimiter,
  handleApproveReview,
);

router.post(
  "/material-revaluations/:executionId/reject",
  requireAuth,
  requireMaterialRevaluationUser,
  requireCsrf,
  revaluationActionLimiter,
  async (req, res) => {
    try {
      const { executionId } = req.params;
      const access = await getExecutionAccess(req.user.userId, executionId);

      if (!access) {
        return res.status(404).json({
          success: false,
          message: "Revaluacion no encontrada o sin permisos de acceso",
        });
      }

      if (!access.can_export) {
        return res.status(403).json({
          success: false,
          message: "El usuario no tiene permisos para rechazar revaluaciones",
        });
      }

      const rejectionReason = String(req.body?.rejectionReason || "").trim();

      if (rejectionReason.length < 5) {
        return res.status(400).json({
          success: false,
          message: "Capture un motivo de rechazo claro.",
        });
      }

      const payload = await getReviewPayload(executionId);
      const review = payload ? normalizeReviewPayload(payload) : null;

      const approvalId = parseApprovalId(req.body?.approvalId);

      const reserved = await markApprovalResolved({
        approvalId,
        executionId,
        status: "REJECTED",
        approved: false,
        comments: rejectionReason,
      });

      if (reserved === 0) {
        return res.status(409).json({
          success: false,
          message: "La revaluacion ya fue procesada previamente.",
        });
      }

      const workflowResult = await triggerMaterialRevaluationSend({
        trigger: "portal_material_revaluation_decision",
        source: "portal",
        decision: "rejected",
        requestedAt: new Date().toISOString(),
        executionId,
        rejectionReason,
        metadata: req.body?.metadata || {
          requestId: review?.requestId || executionId,
          docNum: review?.docNum || null,
          docNums: review?.docNums || [],
          freightFolio: review?.freightFolio || null,
          carrierName: review?.carrierName || null,
          freightCost: review?.freightCost || null,
          accountCode: review?.accountCode || null,
          baseDocumentType: review?.baseDocumentType || null,
          baseDocumentNumber: review?.baseDocumentNumber || null,
          raw: review?.raw || null,
        },
        requestedBy: {
          userId: req.user.userId,
          username: req.user.username,
          displayName: req.user.displayName,
          email: req.user.email,
        },
      });

      if (workflowResult.skipped || !workflowResult.ok) {
        return failAfterResolution(req, res, {
          approvalId,
          executionId,
          fromStatus: "REJECTED",
          workflowResult,
          httpStatus: workflowResult.skipped ? 503 : 502,
        });
      }

      await logActivity(req, {
        action: "revaluation.rejected",
        entityType: "material_revaluation",
        entityId: executionId,
        detail: { approvalId, rejectionReason },
      });

      return res.json({
        success: true,
        message: "Revaluacion rechazada. Se notificara al solicitante.",
        approvalResolved: true,
        workflowResult: publicWorkflowResult(workflowResult),
      });
    } catch (error) {
      console.error("Error al rechazar revaluacion:", error);
      return res
        .status(500)
        .json(buildErrorResponse("Error al rechazar revaluacion", error));
    }
  },
);

router.get(
  "/material-revaluations/stream",
  requireAuth,
  requireMaterialRevaluationUser,
  (req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.write("event: connected\ndata: {}\n\n");

    addClient(res, { userId: req.user.userId });

    const keepAlive = setInterval(() => {
      try {
        res.write(": ping\n\n");
      } catch {
      }
    }, 25000);

    req.on("close", () => {
      clearInterval(keepAlive);
      removeClient(res);
    });
  },
);

router.post(
  "/material-revaluations/notify",
  requireN8nToken,
  n8nNotifyLimiter,
  async (req, res) => {
    try {
      const body = req.body || {};
      const op = body.operation || {};
      const ref = op.businessReference || {};
      const approvalId = parseApprovalId(ref.approvalId ?? body.approvalId);
      const executionId =
        ref.executionId || body.executionId || body.execution_id || body?.metadata?.requestId || null;
      const status = body.status ? String(body.status).toUpperCase() : null;
      const sapDocEntry = body.sapDocEntry ?? null;
      const n8nExecutionId = body.n8nExecutionId ?? op.n8nExecutionId ?? null;
      const errorCode = body.error?.code ?? null;
      const errorMessage = body.error?.message ?? null;

      // SSE: se conserva el comportamiento actual (aviso al frontend).
      const delivered = broadcast("pending", {
        executionId,
        receivedAt: new Date().toISOString(),
      });

     
      let updated = 0;
      if (status && (approvalId || executionId)) {
        const setClause = `SET sap_status = CASE
                WHEN sap_status = 'SUCCEEDED' THEN 'SUCCEEDED'
                WHEN $2 = 'SUCCEEDED' THEN 'SUCCEEDED'
                WHEN $2 = 'FAILED' THEN 'FAILED'
                WHEN $2 = 'UNKNOWN' AND sap_status = 'PROCESSING' THEN 'UNKNOWN'
                ELSE sap_status END,
              sap_doc_entry = COALESCE($3, sap_doc_entry),
              sap_n8n_execution_id = COALESCE($4, sap_n8n_execution_id),
              sap_correlation_id = COALESCE($5, sap_correlation_id),
              sap_idempotency_key = COALESCE($6, sap_idempotency_key),
              sap_error_code = CASE WHEN sap_status = 'SUCCEEDED' OR $2 = 'SUCCEEDED' THEN NULL
                                    ELSE COALESCE($7, sap_error_code) END,
              sap_error_message = CASE WHEN sap_status = 'SUCCEEDED' OR $2 = 'SUCCEEDED' THEN NULL
                                       ELSE COALESCE($8, sap_error_message) END,
              updated_at = NOW()`;
        const params = [
          null, status, sapDocEntry, n8nExecutionId,
          op.correlationId ?? null, op.idempotencyKey ?? null, errorCode, errorMessage,
        ];

        if (approvalId) {
          params[0] = approvalId;
          const r = await pool.query(
            `UPDATE audit.workflow_approvals ${setClause} WHERE id = $1 RETURNING id;`,
            params,
          );
          updated = r.rowCount;
        }
        if (updated === 0 && executionId) {
          params[0] = executionId;
          const r = await pool.query(
            `UPDATE audit.workflow_approvals ${setClause}
              WHERE execution_id::TEXT = $1::TEXT AND approval_status = 'APPROVED' RETURNING id;`,
            params,
          );
          updated = r.rowCount;
        }
      }

      return res.json({ success: true, delivered, updated });
    } catch (error) {
      console.error("Error en callback /material-revaluations/notify:", error);
      return res
        .status(500)
        .json(buildErrorResponse("Error al procesar la notificacion de revaluacion", error));
    }
  },
);

module.exports = router;
