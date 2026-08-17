// ============================================================================
// RUTAS PUBLICAS — registro de embarques por forwarder
// ============================================================================
//
// SIN requireAuth y SIN requireCsrf. Es el unico router del proyecto que
// escribe en la base sin sesion, asi que conviene tener claro por que no es un
// agujero:
//
//   * La credencial es el token del enlace, en el header
//     X-Shipment-Invite-Token. Sin el, ninguna ruta de aqui responde.
//   * NO hay CSRF que valer: CSRF explota la cookie que el navegador adjunta
//     sola. Aqui no hay cookie —la credencial viaja en un header que un
//     formulario de otro sitio no puede fijar sin pasar por CORS— asi que el
//     ataque no aplica. Anadir requireCsrf seria imposible ademas: el forwarder
//     no tiene sesion en la que sembrar el doble token.
//   * El INSERT esta endurecido: el forwarder NO elige source_type,
//     review_status, tracking_enabled ni portal_created_by. Se fuerzan en el
//     servidor. Los campos que si controla pasan por los mismos normalizadores
//     que el alta interna.
//   * Todo queda en activity_log. Como no hay tabla de borradores, ese log es
//     el UNICO rastro de quien registro que y desde donde; logActivity funciona
//     sin sesion (usa req.user?.userId || null y registra req.ip).
//
// El montaje de este router va ANTES que el de international-purchases.routes.js
// en index.js. No por colision de rutas —todas cuelgan de /public/— sino para
// que quede a la vista que existe un tramo sin sesion.

const express = require("express");
const pool = require("../../shared/db/pool");
const {
  forwarderPublicLimiter,
  forwarderSubmitLimiter,
} = require("../../shared/middlewares/rate-limit.middleware");
const {
  triggerInternationalPurchasesTracking,
} = require("../../shared/services/n8n.service");
const { buildErrorResponse } = require("../../shared/utils/errorResponse");
const { mapPgError } = require("../../shared/utils/pgError");
const { logActivity } = require("../../shared/utils/activityLog");
const {
  cleanText,
  normalizeUpper,
  normalizeTrackingKey,
  normalizeScac,
  toInteger,
  sanitizeCustomFields,
} = require("./utils/shipmentFields");
const {
  findUsableInvite,
  messageForReason,
  OPAQUE_REASONS,
} = require("./utils/inviteToken");
const {
  scacValidationError,
  scacCatalogHandler,
} = require("./services/scacCatalog.service");

const router = express.Router();

const INVITE_HEADER = "X-Shipment-Invite-Token";
const ALLOWED_PROVIDER_TYPES = ["NAVIERA", "FORWARDER"];

// El CHECK de la base obliga a que tracking_reference_type sea exactamente
// 'MBL'. El forwarder no lo elige: no tiene sentido ofrecerle un desplegable de
// un solo valor y menos aun dejar que mande otro y se lleve un 23514.
const FIXED_REFERENCE_TYPE = "MBL";

// Middleware de credencial. Deja el enlace resuelto en req.invite para que los
// handlers no vuelvan a consultarlo.
async function requireInviteToken(req, res, next) {
  try {
    const token = req.get(INVITE_HEADER);

    if (!cleanText(token)) {
      return res.status(401).json({
        success: false,
        message:
          "Falta el enlace de registro. Abra el enlace que recibio por correo.",
      });
    }

    const { invite, reason } = await findUsableInvite(token);

    if (reason) {
      // 401 para lo que no sirve y no tiene arreglo del lado del forwarder;
      // 403 para el enlace dormido, que si es recuperable por el operador. La
      // distincion importa: el frontend muestra mensajes distintos.
      const status = reason === "DORMANT" ? 403 : 401;

      // NOT_FOUND y REVOKED se colapsan en 'INVALID'. Los mensajes ya eran
      // identicos, pero devolver el motivo en crudo permitia distinguirlos y
      // eso confirma que un token existio: un atacante con una lista de
      // candidatos sabria cuales acerto aunque esten revocados.
      return res.status(status).json({
        success: false,
        reason: OPAQUE_REASONS.has(reason) ? "INVALID" : reason,
        message: messageForReason(reason),
      });
    }

    req.invite = invite;

    return next();
  } catch (error) {
    return res
      .status(500)
      .json(buildErrorResponse("Error al validar el enlace de registro", error));
  }
}

const publicGuard = [forwarderPublicLimiter, requireInviteToken];

// Lo primero que llama el formulario al cargar: confirma que el enlace sirve y
// devuelve lo minimo para saludar al forwarder por su nombre. No expone el
// correo del destinatario ni las fechas de auditoria.
router.get("/international-purchases/public/invite", ...publicGuard, async (req, res) => {
  await logActivity(req, {
    action: "international_purchases.public_invite_opened",
    entityType: "registration_invite",
    entityId: req.invite.invite_id,
    detail: { forwarderName: req.invite.forwarder_name, submissionCount: req.invite.submission_count },
  });

  return res.json({
    success: true,
    data: {
      forwarderName: req.invite.forwarder_name,
      submissionCount: req.invite.submission_count,
      referenceType: FIXED_REFERENCE_TYPE,
    },
  });
});

// Mismo handler que el del router interno. Lo que cambia es el guard: aqui la
// credencial es el token del enlace, no la sesion.
router.get(
  "/international-purchases/public/scac-catalog",
  ...publicGuard,
  scacCatalogHandler,
);

// Alta de embarque desde fuera. Escribe DIRECTO en shipments —no hay tabla de
// borradores— con review_status = 'PENDING_REVIEW', para que el tracking de n8n
// arranque de inmediato. La revision del operador es posterior y no bloquea.
router.post(
  "/international-purchases/public/shipments",
  forwarderPublicLimiter,
  forwarderSubmitLimiter,
  requireInviteToken,
  async (req, res) => {
    // La conexion se toma DESPUES de validar, no al entrar. Antes se reservaba
    // durante toda la validacion —que ahora incluye una consulta al catalogo
    // SCAC—, asi que una peticion con datos malos ocupaba una conexion del pool
    // sin llegar a usarla. Mismo patron que el PUT y el DELETE internos.
    let client;

    try {
      const trackingKey = normalizeTrackingKey(req.body?.trackingKey);
      const trackingProviderType = normalizeUpper(req.body?.trackingProviderType);
      const trackingProviderName = cleanText(req.body?.trackingProviderName);
      const scac = normalizeScac(req.body?.scac);
      const supplierName = cleanText(req.body?.supplierName);
      const invoiceCode = cleanText(req.body?.invoiceCode);
      const agency = cleanText(req.body?.agency);
      const materialDescription = cleanText(req.body?.materialDescription);
      const containerCount = toInteger(req.body?.containerCount);
      const notes = cleanText(req.body?.notes);
      const customFields = sanitizeCustomFields(req.body?.customFields);

      const errors = [];

      if (!trackingKey) {
        errors.push("El MBL es obligatorio.");
      } else if (trackingKey.length > 100) {
        errors.push("El MBL no puede superar los 100 caracteres.");
      }

      if (!trackingProviderType) {
        errors.push("El tipo de proveedor es obligatorio.");
      } else if (!ALLOWED_PROVIDER_TYPES.includes(trackingProviderType)) {
        errors.push("El tipo de proveedor debe ser NAVIERA o FORWARDER.");
      }

      if (!trackingProviderName) {
        errors.push("El nombre de la naviera o forwarder es obligatorio.");
      }

      if (!scac) {
        errors.push("El SCAC es obligatorio.");
      }

      if (containerCount !== null && containerCount < 0) {
        errors.push("El numero de contenedores no puede ser negativo.");
      }

      // Se comprueba contra el catalogo solo si el codigo llego: sin scac ya se
      // acumulo el error de obligatorio y no hay nada que buscar. Se suma al
      // mismo array para que el forwarder vea todos sus errores de una vez, que
      // es como funciona el resto de este formulario.
      if (scac) {
        const scacError = await scacValidationError(scac);

        if (scacError) errors.push(scacError);
      }

      if (errors.length > 0) {
        return res.status(400).json({
          success: false,
          message: "Datos invalidos para registrar el embarque.",
          errors,
        });
      }

      client = await pool.connect();
      await client.query("BEGIN");

      // El bloque de columnas que el forwarder NO controla se escribe con
      // literales, no con parametros: asi no hay forma de que un campo del
      // cuerpo acabe decidiendo el origen o el estado de revision aunque
      // alguien anada mas adelante un spread del body.
      const result = await client.query(
        `
          INSERT INTO international_purchases.shipments (
            tracking_key,
            tracking_reference_type,
            tracking_provider_type,
            tracking_provider_name,
            scac,
            carrier,
            supplier_name,
            invoice_code,
            agency,
            material_description,
            container_count,
            portal_notes,
            custom_fields,

            source_type,
            review_status,
            tracking_enabled,
            portal_created_by,
            registered_by_invite_id
          )
          VALUES (
            $1,
            '${FIXED_REFERENCE_TYPE}',
            $2,
            $3,
            $4,
            CASE WHEN $2 = 'NAVIERA' THEN $3 ELSE NULL END,
            $5,
            $6,
            $7,
            $8,
            $9,
            $10,
            $11::jsonb,

            'FORWARDER',
            'PENDING_REVIEW',
            TRUE,
            $12,
            $13
          )
          ON CONFLICT (tracking_key)
          DO NOTHING
          RETURNING
            shipment_id,
            tracking_key,
            tracking_reference_type,
            tracking_provider_type,
            tracking_provider_name,
            scac,
            supplier_name,
            invoice_code,
            agency,
            material_description,
            container_count,
            source_type,
            review_status,
            portal_notes,
            custom_fields;
        `,
        [
          trackingKey,
          trackingProviderType,
          trackingProviderName,
          scac,
          supplierName,
          invoiceCode,
          agency,
          materialDescription,
          containerCount,
          notes,
          JSON.stringify(customFields),
          // portal_created_by guarda quien lo capturo. En el alta interna es el
          // username; aqui no hay usuario, asi que se deja el forwarder y el
          // enlace, que es lo mas parecido a una identidad que existe.
          `forwarder:${req.invite.forwarder_name}`,
          req.invite.invite_id,
        ],
      );

      if (result.rows.length === 0) {
        await client.query("ROLLBACK");

        await logActivity(req, {
          action: "international_purchases.public_shipment_duplicate",
          entityType: "registration_invite",
          entityId: req.invite.invite_id,
          detail: { forwarderName: req.invite.forwarder_name, trackingKey, outcome: 'DUPLICATE' },
        });

        return res.status(409).json({
          success: false,
          message:
            "Ese MBL ya esta registrado. No se sobrescribio ningun dato existente.",
        });
      }

      const shipment = result.rows[0];

      // El contador y la fecha de uso van en la MISMA transaccion que el alta:
      // si el INSERT se deshace, el enlace no debe figurar como usado. Ademas
      // last_used_at es lo que alimenta la latencia perezosa, asi que cada alta
      // rearma el reloj de los 18 meses.
      await client.query(
        `
          UPDATE international_purchases.registration_invites
             SET submission_count = submission_count + 1,
                 last_used_at = NOW()
           WHERE invite_id = $1;
        `,
        [req.invite.invite_id],
      );

      await client.query("COMMIT");

      // Todo lo externo, DESPUES del COMMIT: ni el log ni el aviso a n8n pueden
      // deshacer la transaccion, y un fallo suyo no debe perder el embarque.
      await logActivity(req, {
        action: "international_purchases.public_shipment_created",
        entityType: "shipment",
        entityId: shipment.shipment_id,
        detail: { forwarderName: req.invite.forwarder_name, inviteId: req.invite.invite_id, trackingKey: shipment.tracking_key, scac: shipment.scac },
      });

      const trackingWorkflow = await triggerInternationalPurchasesTracking({
        trigger: "shipment_created",
        source: "forwarder_portal",
        requestedAt: new Date().toISOString(),
        requestedBy: {
          forwarderName: req.invite.forwarder_name,
          inviteId: req.invite.invite_id,
        },
        shipment: {
          shipmentId: shipment.shipment_id,
          trackingKey: shipment.tracking_key,
          scac: shipment.scac,
        },
      });

      return res.status(201).json({
        success: true,
        data: shipment,
        // No se devuelve el detalle del workflow: es informacion interna y el
        // forwarder no puede hacer nada con ella. Solo se dice si el
        // seguimiento arranco, que si le sirve para saber si avisar.
        trackingStarted: trackingWorkflow.ok === true,
        message:
          "Embarque registrado. Maderas Rivero lo revisara; no hace falta que envie el MBL por correo.",
      });
    } catch (error) {
      // `client` puede no existir: el fallo pudo ocurrir validando, antes de
      // tomar la conexion.
      if (client) {
        await client.query("ROLLBACK").catch(() => {});
      }

      const mapped = mapPgError(error);

      // Antes decia `mapped.message`, que no existe: mapPgError devuelve
      // { status, body }. La clave salia como undefined y JSON.stringify la
      // elimina, asi que el forwarder recibia {"success":false} sin mensaje y
      // veia el texto generico de respaldo de publicApi.js en vez de saber que
      // corregir. Los otros 5 usos del proyecto ya hacian esto bien.
      if (mapped) return res.status(mapped.status).json(mapped.body);

      return res
        .status(500)
        .json(buildErrorResponse("Error al registrar el embarque", error));
    } finally {
      if (client) client.release();
    }
  },
);

module.exports = router;
