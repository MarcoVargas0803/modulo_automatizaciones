// --- IMPORTACIONES ---
const express = require("express");
const pool = require("../../shared/db/pool");
const env = require("../../shared/config/env");
const { requireAuth } = require("../../shared/middlewares/auth.middleware");
const { requireProcess } = require("../../shared/middlewares/access.middleware");
const { requireCsrf } = require("../../shared/middlewares/csrf.middleware");
const {
  internationalPurchasesActionLimiter,
} = require("../../shared/middlewares/rate-limit.middleware");
const { triggerForwarderInvite } = require("../../shared/services/n8n.service");
const { buildErrorResponse } = require("../../shared/utils/errorResponse");
const { mapPgError } = require("../../shared/utils/pgError");
const { logActivity } = require("../../shared/utils/activityLog");
const { cleanText, UUID_REGEX } = require("./utils/shipmentFields");
const { generateToken, hashToken } = require("./utils/inviteToken");

const router = express.Router();

const PROCESS_CODE = "international_purchases";

// Mismas cadenas que international-purchases.routes.js. Es el patron de
// admin.routes.js:23-24, el unico archivo que formaliza los guards con arrays.
const guard = [requireAuth, requireProcess(PROCESS_CODE, { denyAuditorWrite: true })];
const writeGuard = [...guard, requireCsrf, internationalPurchasesActionLimiter];

// Validacion deliberadamente laxa: comprueba la forma, no la existencia del
// buzon. Un correo sintacticamente valido pero inexistente lo detecta el
// workflow de n8n al intentar enviarlo, y esa respuesta si llega al operador.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Construye el enlace que recibe el forwarder. El token va en el FRAGMENTO
// (#token=), nunca en la query: el fragmento no viaja al servidor, no aparece
// en los logs de acceso ni en el Referer al navegar fuera. Es la misma decision
// que el enlace de revision de pagos.
function buildRegistrationUrl(token) {
  const base = String(env.internationalPurchases.registrationBaseUrl).replace(/\/+$/, "");

  return `${base}${env.internationalPurchases.registrationPath}#token=${token}`;
}

// El token en claro NUNCA vuelve a salir de la base: solo esta en la respuesta
// de emision y regeneracion. Esta proyeccion es lo unico que ve el inventario.
const INVITE_COLUMNS = `
  invite_id,
  forwarder_name,
  recipient_email,
  status,
  expires_at,
  dormant_after_days,
  submission_count,
  last_used_at,
  replaced_by_invite_id,
  created_by,
  created_at,
  revoked_by,
  revoked_at
`;

function parseInviteId(value) {
  const text = cleanText(value);

  return text && UUID_REGEX.test(text) ? text : null;
}

// Emite el enlace e intenta enviarlo por correo. El envio va DESPUES del COMMIT
// a proposito: si n8n esta caido, el enlace ya existe y el operador puede
// copiarlo a mano. Al reves —enviar y luego guardar— se podria mandar un correo
// con un enlace que no llego a existir.
router.post(
  "/international-purchases/invites",
  ...writeGuard,
  async (req, res) => {
    try {
      const forwarderName = cleanText(req.body?.forwarderName);
      const recipientEmail = cleanText(req.body?.recipientEmail);
      const rawDormantDays = req.body?.dormantAfterDays;

      const errors = [];

      if (!forwarderName) {
        errors.push("El nombre del forwarder es obligatorio.");
      } else if (forwarderName.length > 200) {
        errors.push("El nombre del forwarder no puede superar los 200 caracteres.");
      }

      if (!recipientEmail) {
        errors.push("El correo del destinatario es obligatorio.");
      } else if (!EMAIL_REGEX.test(recipientEmail) || recipientEmail.length > 320) {
        errors.push("El correo del destinatario no tiene un formato valido.");
      }

      // null explicito = enlace que nunca duerme. undefined = usar el DEFAULT
      // de la base (548 dias). Son casos distintos y hay que poder pedir ambos.
      let dormantAfterDays;

      if (rawDormantDays === null) {
        dormantAfterDays = null;
      } else if (rawDormantDays === undefined || rawDormantDays === "") {
        dormantAfterDays = 548;
      } else {
        const parsed = Number(rawDormantDays);

        if (!Number.isInteger(parsed) || parsed < 1 || parsed > 3650) {
          errors.push("Los dias de inactividad deben ser un entero entre 1 y 3650.");
        } else {
          dormantAfterDays = parsed;
        }
      }

      if (errors.length > 0) {
        return res.status(400).json({
          success: false,
          message: "Datos invalidos para emitir el enlace.",
          errors,
        });
      }

      const token = generateToken();

      const result = await pool.query(
        `
          INSERT INTO international_purchases.registration_invites (
            token_hash,
            forwarder_name,
            recipient_email,
            dormant_after_days,
            created_by
          )
          VALUES ($1, $2, $3, $4, $5)
          RETURNING ${INVITE_COLUMNS};
        `,
        [
          hashToken(token),
          forwarderName,
          recipientEmail,
          dormantAfterDays,
          req.user.username,
        ],
      );

      const invite = result.rows[0];
      const registrationUrl = buildRegistrationUrl(token);

      await logActivity(req, {
        action: "international_purchases.invite_created",
        entityType: "registration_invite",
        entityId: invite.invite_id,
        detail: { forwarderName, recipientEmail, dormantAfterDays },
      });

      const notification = await triggerForwarderInvite({
        trigger: "forwarder_invite_created",
        requestedAt: new Date().toISOString(),
        requestedBy: {
          userId: req.user.userId,
          username: req.user.username,
          displayName: req.user.displayName,
        },
        invite: {
          inviteId: invite.invite_id,
          forwarderName: invite.forwarder_name,
          recipientEmail: invite.recipient_email,
          registrationUrl,
        },
      });

      return res.status(201).json({
        success: true,
        // Unica vez que el token en claro sale del servidor. La base solo
        // guarda su SHA-256, asi que si el operador no lo copia ahora, el
        // enlace se pierde y hay que regenerarlo.
        data: { ...invite, registrationUrl },
        notified: notification.notified === true,
        message: notification.notified
          ? "Enlace emitido y enviado por correo."
          : `Enlace emitido, pero no se pudo enviar por correo: ${notification.message}. Copielo y entreguelo manualmente.`,
      });
    } catch (error) {
      // `mapped.body`, no `mapped.message`: mapPgError devuelve { status, body }.
      // Con `.message` la clave salia undefined y el operador recibia
      // {"success":false} sin explicacion.
      const mapped = mapPgError(error);

      if (mapped) return res.status(mapped.status).json(mapped.body);

      return res
        .status(500)
        .json(buildErrorResponse("Error al emitir el enlace de registro", error));
    }
  },
);

// Inventario de enlaces. Sin paginacion a proposito: son uno por forwarder, del
// orden de decenas. Si algun dia crece, se le pone getPagination como al resto.
router.get("/international-purchases/invites", ...guard, async (req, res) => {
  try {
    const status = cleanText(req.query?.status);

    if (status && !["ACTIVE", "DORMANT", "REVOKED"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "El filtro status debe ser ACTIVE, DORMANT o REVOKED.",
      });
    }

    const result = await pool.query(
      `
        SELECT ${INVITE_COLUMNS}
        FROM international_purchases.registration_invites
        WHERE ($1::text IS NULL OR status = $1)
        ORDER BY
          CASE status WHEN 'ACTIVE' THEN 0 WHEN 'DORMANT' THEN 1 ELSE 2 END,
          created_at DESC;
      `,
      [status],
    );

    return res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    return res
      .status(500)
      .json(buildErrorResponse("Error al consultar los enlaces de registro", error));
  }
});

router.post(
  "/international-purchases/invites/:inviteId/revoke",
  ...writeGuard,
  async (req, res) => {
    try {
      const inviteId = parseInviteId(req.params.inviteId);

      if (!inviteId) {
        return res.status(400).json({
          success: false,
          message: "El identificador del enlace no es valido.",
        });
      }

      // El WHERE excluye los ya revocados para poder distinguir "no existe" de
      // "ya estaba revocado" con una sola consulta de comprobacion.
      const result = await pool.query(
        `
          UPDATE international_purchases.registration_invites
             SET status = 'REVOKED',
                 revoked_by = $2,
                 revoked_at = NOW()
           WHERE invite_id = $1
             AND status <> 'REVOKED'
          RETURNING ${INVITE_COLUMNS};
        `,
        [inviteId, req.user.username],
      );

      if (result.rows.length === 0) {
        const exists = await pool.query(
          `SELECT status FROM international_purchases.registration_invites WHERE invite_id = $1;`,
          [inviteId],
        );

        if (exists.rows.length === 0) {
          return res.status(404).json({
            success: false,
            message: "El enlace no existe.",
          });
        }

        return res.status(409).json({
          success: false,
          message: "El enlace ya estaba revocado.",
        });
      }

      const invite = result.rows[0];

      await logActivity(req, {
        action: "international_purchases.invite_revoked",
        entityType: "registration_invite",
        entityId: invite.invite_id,
        detail: { forwarderName: invite.forwarder_name, recipientEmail: invite.recipient_email, submissionCount: invite.submission_count },
      });

      return res.json({
        success: true,
        data: invite,
        message: "Enlace revocado. Deja de funcionar de inmediato.",
      });
    } catch (error) {
      return res
        .status(500)
        .json(buildErrorResponse("Error al revocar el enlace de registro", error));
    }
  },
);

// Regenerar = emitir uno nuevo y revocar el viejo, dejando el rastro en
// replaced_by_invite_id. Es lo que se usa cuando cambia la persona de contacto
// del forwarder o cuando se sospecha que el enlace se filtro.
//
// Las dos escrituras van en una transaccion: si el UPDATE del viejo fallara
// despues del INSERT del nuevo, quedarian DOS enlaces vivos para el mismo
// forwarder, que es exactamente lo que se quiere evitar al regenerar.
router.post(
  "/international-purchases/invites/:inviteId/regenerate",
  ...writeGuard,
  async (req, res) => {
    const client = await pool.connect();

    try {
      const inviteId = parseInviteId(req.params.inviteId);

      if (!inviteId) {
        return res.status(400).json({
          success: false,
          message: "El identificador del enlace no es valido.",
        });
      }

      await client.query("BEGIN");

      const previous = await client.query(
        `
          SELECT invite_id, forwarder_name, recipient_email, dormant_after_days,
                 status, replaced_by_invite_id
            FROM international_purchases.registration_invites
           WHERE invite_id = $1
           FOR UPDATE;
        `,
        [inviteId],
      );

      if (previous.rows.length === 0) {
        await client.query("ROLLBACK");

        return res.status(404).json({
          success: false,
          message: "El enlace no existe.",
        });
      }

      const old = previous.rows[0];

      if (old.replaced_by_invite_id) {
        await client.query("ROLLBACK");

        return res.status(409).json({
          success: false,
          message:
            "Ese enlace ya fue regenerado antes. Regenere el enlace vigente, no uno historico.",
        });
      }

      const token = generateToken();

      const created = await client.query(
        `
          INSERT INTO international_purchases.registration_invites (
            token_hash, forwarder_name, recipient_email, dormant_after_days, created_by
          )
          VALUES ($1, $2, $3, $4, $5)
          RETURNING ${INVITE_COLUMNS};
        `,
        [
          hashToken(token),
          old.forwarder_name,
          old.recipient_email,
          old.dormant_after_days,
          req.user.username,
        ],
      );

      const invite = created.rows[0];

      await client.query(
        `
          UPDATE international_purchases.registration_invites
             SET status = 'REVOKED',
                 revoked_by = $2,
                 revoked_at = NOW(),
                 replaced_by_invite_id = $3
           WHERE invite_id = $1;
        `,
        [inviteId, req.user.username, invite.invite_id],
      );

      await client.query("COMMIT");

      const registrationUrl = buildRegistrationUrl(token);

      await logActivity(req, {
        action: "international_purchases.invite_regenerated",
        entityType: "registration_invite",
        entityId: invite.invite_id,
        detail: { forwarderName: invite.forwarder_name, recipientEmail: invite.recipient_email, replacesInviteId: inviteId },
      });

      const notification = await triggerForwarderInvite({
        trigger: "forwarder_invite_regenerated",
        requestedAt: new Date().toISOString(),
        requestedBy: {
          userId: req.user.userId,
          username: req.user.username,
          displayName: req.user.displayName,
        },
        invite: {
          inviteId: invite.invite_id,
          forwarderName: invite.forwarder_name,
          recipientEmail: invite.recipient_email,
          registrationUrl,
          replacesInviteId: inviteId,
        },
      });

      return res.status(201).json({
        success: true,
        data: { ...invite, registrationUrl },
        notified: notification.notified === true,
        message: notification.notified
          ? "Enlace regenerado y enviado por correo. El anterior quedo revocado."
          : `Enlace regenerado —el anterior quedo revocado—, pero no se pudo enviar por correo: ${notification.message}. Copielo y entreguelo manualmente.`,
      });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});

      return res
        .status(500)
        .json(buildErrorResponse("Error al regenerar el enlace de registro", error));
    } finally {
      client.release();
    }
  },
);

// Reactivar solo aplica a DORMANT. Un enlace revocado NO se reactiva: se
// regenera. La diferencia importa —dormir es inactividad, revocar es una
// decision— y confundirlas devolveria la vida a un token que se dio por perdido.
router.post(
  "/international-purchases/invites/:inviteId/reactivate",
  ...writeGuard,
  async (req, res) => {
    try {
      const inviteId = parseInviteId(req.params.inviteId);

      if (!inviteId) {
        return res.status(400).json({
          success: false,
          message: "El identificador del enlace no es valido.",
        });
      }

      // last_used_at se adelanta a ahora: sin eso el enlace volveria a dormirse
      // en la siguiente peticion, porque la latencia se mide contra esa fecha.
      const result = await pool.query(
        `
          UPDATE international_purchases.registration_invites
             SET status = 'ACTIVE',
                 last_used_at = NOW()
           WHERE invite_id = $1
             AND status = 'DORMANT'
          RETURNING ${INVITE_COLUMNS};
        `,
        [inviteId],
      );

      if (result.rows.length === 0) {
        const exists = await pool.query(
          `SELECT status FROM international_purchases.registration_invites WHERE invite_id = $1;`,
          [inviteId],
        );

        if (exists.rows.length === 0) {
          return res.status(404).json({
            success: false,
            message: "El enlace no existe.",
          });
        }

        return res.status(409).json({
          success: false,
          message:
            exists.rows[0].status === "REVOKED"
              ? "Un enlace revocado no se reactiva: regenerelo para emitir uno nuevo."
              : "El enlace ya esta activo.",
        });
      }

      const invite = result.rows[0];

      await logActivity(req, {
        action: "international_purchases.invite_reactivated",
        entityType: "registration_invite",
        entityId: invite.invite_id,
        detail: { forwarderName: invite.forwarder_name, recipientEmail: invite.recipient_email },
      });

      return res.json({
        success: true,
        data: invite,
        message: "Enlace reactivado.",
      });
    } catch (error) {
      return res
        .status(500)
        .json(buildErrorResponse("Error al reactivar el enlace de registro", error));
    }
  },
);

// Cierra el ciclo de revision de un embarque registrado desde fuera. NO es una
// compuerta: el embarque ya existe y su tracking ya corre desde el alta. Esto
// solo marca que un operador lo miro.
router.post(
  "/international-purchases/shipments/:shipmentId/review",
  ...writeGuard,
  async (req, res) => {
    try {
      const shipmentId = parseInviteId(req.params.shipmentId);
      const decision = cleanText(req.body?.decision);

      if (!shipmentId) {
        return res.status(400).json({
          success: false,
          message: "El identificador del embarque no es valido.",
        });
      }

      if (!["REVIEWED", "DISCARDED"].includes(decision)) {
        return res.status(400).json({
          success: false,
          message: "La decision debe ser REVIEWED o DISCARDED.",
        });
      }

      const result = await pool.query(
        `
          UPDATE international_purchases.shipments
             SET review_status = $2,
                 reviewed_by = $3,
                 reviewed_at = NOW()
           WHERE shipment_id = $1
          RETURNING shipment_id, tracking_key, review_status, reviewed_by, reviewed_at;
        `,
        [shipmentId, decision, req.user.username],
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "El embarque no existe.",
        });
      }

      const shipment = result.rows[0];

      await logActivity(req, {
        action:
          decision === "DISCARDED"
            ? "international_purchases.shipment_discarded"
            : "international_purchases.shipment_reviewed",
        entityType: "shipment",
        entityId: shipment.shipment_id,
        detail: { trackingKey: shipment.tracking_key, decision },
      });

      return res.json({
        success: true,
        data: shipment,
        message:
          decision === "DISCARDED"
            ? "Embarque descartado. Se oculta del listado sin borrar el registro."
            : "Embarque marcado como revisado.",
      });
    } catch (error) {
      const mapped = mapPgError(error);

      if (mapped) return res.status(mapped.status).json(mapped.body);

      return res
        .status(500)
        .json(buildErrorResponse("Error al actualizar la revision del embarque", error));
    }
  },
);

module.exports = router;
