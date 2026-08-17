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
const {
  triggerInternationalPurchasesTracking,
} = require("../../shared/services/n8n.service");
const { buildErrorResponse } = require("../../shared/utils/errorResponse");
const { mapPgError } = require("../../shared/utils/pgError");
const { logActivity } = require("../../shared/utils/activityLog");
// Los normalizadores vivian aqui. Se movieron a utils/ porque el router publico
// —el alta que hace el forwarder sin sesion— necesita exactamente las mismas
// reglas; copiarlas dejaria que las dos altas divergieran en silencio.
const {
  cleanText,
  normalizeUpper,
  normalizeTrackingKey,
  normalizeScac,
  toInteger,
  sanitizeCustomFields,
  UUID_REGEX,
} = require("./utils/shipmentFields");
// El cache de 24 h del catalogo SCAC se fue con el: dos routers con su propia
// copia del cache harian el doble de llamadas a una API de pago. El handler del
// endpoint tambien vive alli, porque el router publico expone el mismo catalogo.
const {
  scacValidationError,
  scacCatalogHandler,
} = require("./services/scacCatalog.service");

const router = express.Router();

// --- CONSTANTES DE VALIDACIÓN ---
const PROCESS_CODE = "international_purchases";
const ALLOWED_SHIPMENT_STATUSES = [
  "PLANNED",
  "IN_TRANSIT",
  "DELIVERED",
  "UNKNOWN",
];

const ALLOWED_PROVIDER_TYPES = ["NAVIERA", "FORWARDER"];

// Espeja el CHECK shipments_source_type_check de la base, verificado contra la
// base de desarrollo el 05/08/2026:
//   CHECK (source_type = ANY (ARRAY['EMAIL','PORTAL','N8N','MANUAL']))
//
// Antes decia ["PORTAL","N8N","IMPORT","SYSTEM"] y divergia en los dos sentidos:
// 'EMAIL' y 'MANUAL' son valores legales -- 'EMAIL' es ademas el DEFAULT de la
// columna-- pero el filtro los rechazaba con 400; y 'IMPORT'/'SYSTEM' pasaban el
// filtro sin poder existir jamas en la tabla. No se noto porque todas las filas
// de hoy son 'PORTAL'.
//
// Al tocar esta lista, tocar tambien el CHECK: son la misma regla en dos sitios.
const ALLOWED_SOURCE_TYPES = ["EMAIL", "PORTAL", "N8N", "MANUAL"];

// ALLOWED_REFERENCE_TYPES = ["BL","BK","CT"] vivia aqui y se borro: no se usaba
// en ninguna parte y los tres valores eran imposibles. La base impone
//   CHECK (tracking_reference_type IS NOT NULL AND tracking_reference_type = 'MBL')
// asi que la referencia solo puede ser 'MBL'.

function validateRequiredFields({
  trackingKey,
  trackingProviderType,
  trackingProviderName,
  scac,
}) {
  const errors = [];

  if (!trackingKey) {
    errors.push("La referencia es obligatoria.");
  }

  // Ninguno de los dos tipos se valida aqui, pero son columnas distintas y con
  // reglas distintas en la base (verificado el 05/08/2026):
  //
  //   tracking_reference_type -> CHECK (... = 'MBL'). Solo admite 'MBL', y el
  //     portal lo manda fijo desde initialForm. No lo asigna n8n.
  //   shipment_type -> CHECK (... IN ('CT','BL','BK','DC')). Ese SI lo detecta y
  //     lo asigna el flujo de n8n, y el portal nunca lo escribe.

  // --- DEPRECADO ---
  if (!trackingProviderType) {
    errors.push("El tipo de proveedor es obligatorio.");
  } else if (!["NAVIERA", "FORWARDER"].includes(trackingProviderType)) {
    errors.push("El tipo de proveedor debe ser NAVIERA o FORWARDER.");
  }

  if (!trackingProviderName) {
    errors.push("El nombre de la Naviera o Forwarder es obligatorio.");
  }

  if (!scac) {
    errors.push("El SCAC es obligatorio.");
  }

  return errors;
}

// Espeja shipments_review_status_check. El alta externa nace PENDING_REVIEW;
// todo lo demas nace REVIEWED por el DEFAULT de la columna.
const ALLOWED_REVIEW_STATUSES = ["PENDING_REVIEW", "REVIEWED", "DISCARDED"];

function validateShipmentFilters({
  search,
  status,
  providerType,
  sourceType,
  reviewStatus,
  eta,
}) {
  const errors = [];

  if (
    reviewStatus &&
    !ALLOWED_REVIEW_STATUSES.includes(String(reviewStatus).trim().toUpperCase())
  ) {
    errors.push(
      `El filtro reviewStatus debe ser uno de: ${ALLOWED_REVIEW_STATUSES.join(", ")}.`,
    );
  }

  if (search && String(search).trim().length > 100) {
    errors.push("El filtro search no puede superar los 100 caracteres.");
  }

  if (eta && !/^\d{4}-\d{2}-\d{2}$/.test(String(eta).trim())) {
    errors.push("El filtro eta debe tener formato YYYY-MM-DD.");
  }

  if (
    status &&
    !ALLOWED_SHIPMENT_STATUSES.includes(String(status).trim().toUpperCase())
  ) {
    errors.push(
      `El filtro status debe ser uno de: ${ALLOWED_SHIPMENT_STATUSES.join(", ")}.`,
    );
  }

  if (
    providerType &&
    !ALLOWED_PROVIDER_TYPES.includes(String(providerType).trim().toUpperCase())
  ) {
    errors.push(
      `El filtro providerType debe ser uno de: ${ALLOWED_PROVIDER_TYPES.join(", ")}.`,
    );
  }

  if (
    sourceType &&
    !ALLOWED_SOURCE_TYPES.includes(String(sourceType).trim().toUpperCase())
  ) {
    errors.push(
      `El filtro sourceType debe ser uno de: ${ALLOWED_SOURCE_TYPES.join(", ")}.`,
    );
  }

  return errors;
}

// Cadenas de middlewares canonicas del modulo, con el patron de arrays de
// admin.routes.js y de international-purchases-dashboard.routes.js.
//
// Antes este archivo tenia su propia copia del SQL de requireProcess dentro de
// getInternationalPurchasesModuleAccess(), llamada a mano al principio de cada
// handler. Era equivalente -- cruzaba user_process_access con users y processes
// exigiendo las tres activas-- pero duplicada: cualquier cambio en la regla de
// acceso obligaba a tocar dos sitios. El resultado del gate queda ahora en
// req.processAccess, con las columnas tal cual salen de la base (can_view,
// can_export, role).
const guard = [requireAuth, requireProcess(PROCESS_CODE, { denyAuditorWrite: true })];
// El limiter faltaba aqui: las cuatro escrituras de embarques (POST, PUT, DELETE
// y refresh-tracking) eran las unicas del modulo sin cuota, mientras que las de
// invitaciones si la tenian. Es el mismo limiter, a proposito: la cuota es por
// IP y por modulo, no por endpoint.
const writeGuard = [...guard, requireCsrf, internationalPurchasesActionLimiter];

/**
 * NOTA — updated_at en embarques:
 * El portal NO escribe updated_at en INSERT ni en UPDATE (PUT).
 * El campo updated_at de international_purchases.shipments es gestionado
 * exclusivamente por el flujo de n8n, que lo actualiza con la fecha real
 * del último cambio de tracking recibido desde la API externa.
 * El trigger trg_shipments_update_metadata existe en la BD pero será
 * deshabilitado/eliminado para que n8n pueda escribir el valor correcto.
 * Desde el backend del portal sólo se lee updated_at (RETURNING / SELECT).
 */
router.post(
  "/international-purchases/shipments",
  ...writeGuard,
  async (req, res) => {
    try {
      const userId = req.user.userId;

      const trackingKey = normalizeTrackingKey(req.body.tracking_key);
      const trackingReferenceType = normalizeUpper(req.body.tracking_reference_type);
      const trackingProviderType = normalizeUpper(req.body.tracking_provider_type);
      const trackingProviderName = cleanText(req.body.tracking_provider_name);
      const scac = normalizeScac(req.body.scac);
      const portalNotes = cleanText(req.body.portal_notes);
      const supplierName = cleanText(req.body.supplier_name);
      const invoiceCode = cleanText(req.body.invoice_code);
      const agency = cleanText(req.body.agency);
      const materialDescription = cleanText(req.body.material_description);
      const containerCount = toInteger(req.body.container_count);
      const customFields = sanitizeCustomFields(req.body.custom_fields);

      const validationErrors = validateRequiredFields({
        trackingKey,
        trackingProviderType,
        trackingProviderName,
        scac,
      });

      if (validationErrors.length > 0) {
        return res.status(400).json({
          success: false,
          message: "Datos inválidos para registrar el embarque.",
          errors: validationErrors,
        });
      }

      // El catalogo se comprueba aparte porque la consulta es asincrona y
      // validateRequiredFields no lo es. Va DESPUES del corte de arriba: sin
      // scac ya salio el error de obligatorio y no hay nada que buscar.
      const scacError = await scacValidationError(scac);

      if (scacError) {
        return res.status(400).json({
          success: false,
          message: "Datos inválidos para registrar el embarque.",
          errors: [scacError],
        });
      }

      // La columna espejo `bl` ya no se lee NI se escribe desde el portal. Se
      // retiro del SELECT del listado, del filtro de busqueda —era redundante, la
      // busqueda ya cruza tracking_key—, de los RETURNING y ahora tambien de este
      // INSERT: el CASE `WHEN $2 = 'BL'` estaba muerto porque el CHECK
      // shipments_tracking_reference_type_check obliga a que
      // tracking_reference_type sea exactamente 'MBL', asi que esa rama nunca se
      // cumplia y todo embarque nacia con bl = NULL.
      //
      // Este es el PASO A de la retirada: el codigo deja de nombrar la columna.
      // El PASO B —el DROP COLUMN— vive en el Bloque 4 de
      // backend/src/scripts/schema-international-purchases-invites.sql y NO se
      // puede ejecutar hasta que este cambio este desplegado: con el codigo
      // anterior, cada alta y cada edicion fallarian con 42703.
      const result = await pool.query(
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

          source_type,
          tracking_enabled,

          portal_created_by,
          portal_notes,
          custom_fields
        )
        VALUES (
          $1,
          $2,

          $3,
          $4,
          $5,

          CASE WHEN $3 = 'NAVIERA' THEN $4 ELSE NULL END,

          $6,
          $7,
          $8,
          $9,
          $10,

          'PORTAL',
          TRUE,

          $11,
          $12,
          $13::jsonb
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
          carrier,
          supplier_name,
          invoice_code,
          agency,
          material_description,
          container_count,
          warnings,
          source_type,
          shipment_status,
          shipment_type,
          tracking_enabled,
          portal_created_by,
          portal_notes,
          custom_fields,
          updated_at;
      `,
        [
          trackingKey,
          trackingReferenceType,
          trackingProviderType,
          trackingProviderName,
          scac,
          supplierName,
          invoiceCode,
          agency,
          materialDescription,
          containerCount,
          String(userId),
          portalNotes,
          JSON.stringify(customFields),
        ],
      );

      if (result.rows.length === 0) {
        return res.status(409).json({
          success: false,
          message:
            "Ya existe un embarque registrado con el mismo BL / MBL / HBL. No se sobrescribieron datos existentes.",
        });
      }

      const shipment = result.rows[0];

      await logActivity(req, {
        action: "international_purchases.shipment_created",
        entityType: "shipment",
        entityId: shipment.shipment_id,
        detail: {
          trackingKey: shipment.tracking_key,
          trackingReferenceType: shipment.tracking_reference_type,
          scac: shipment.scac,
          supplierName: shipment.supplier_name,
          invoiceCode: shipment.invoice_code,
          origen: "portal",
        },
      });

      const trackingWorkflow = await triggerInternationalPurchasesTracking({
        trigger: "shipment_created",
        source: "portal",
        requestedAt: new Date().toISOString(),
        requestedBy: {
          userId,
          username: req.user.username,
          displayName: req.user.displayName,
          email: req.user.email,
        },
        shipment: {
          shipmentId: shipment.shipment_id,
          trackingKey: shipment.tracking_key,
          trackingReferenceType: shipment.tracking_reference_type,
          trackingProviderType: shipment.tracking_provider_type,
          trackingProviderName: shipment.tracking_provider_name,
          scac: shipment.scac,
        },
      });

      return res.status(201).json({
        success: true,
        message: trackingWorkflow.ok
          ? "Embarque registrado correctamente. Tracking activado."
          : "Embarque registrado correctamente. No se pudo activar el tracking automaticamente.",
        data: shipment,
        trackingWorkflow,
      });
    } catch (error) {
      const mapped = mapPgError(error, {
        23505: "Ya existe un embarque con esa referencia.",
      });
      if (mapped) return res.status(mapped.status).json(mapped.body);

      return res
        .status(500)
        .json(
          buildErrorResponse(
            "Error al registrar el embarque de Compras Internacionales",
            error,
          ),
        );
    }
  },
);

router.post(
  "/international-purchases/shipments/refresh-tracking",
  ...writeGuard,
  async (req, res) => {
    try {
      const userId = req.user.userId;

      const trackingWorkflow = await triggerInternationalPurchasesTracking({
        trigger: "manual_refresh",
        source: "portal",
        requestedAt: new Date().toISOString(),
        requestedBy: {
          userId,
          username: req.user.username,
          displayName: req.user.displayName,
          email: req.user.email,
        },
        filters: req.body?.filters || {},
      });

      if (trackingWorkflow.skipped) {
        return res.status(503).json({
          success: false,
          message: trackingWorkflow.message,
          trackingWorkflow,
        });
      }

      if (!trackingWorkflow.ok) {
        return res.status(502).json({
          success: false,
          message: trackingWorkflow.message,
          trackingWorkflow,
        });
      }

      // Solo se audita el refresco que realmente arranco: las dos salidas de
      // arriba (503 sin webhook configurado, 502 si n8n rechaza) no llegan aqui,
      // asi que el log no registra intentos fallidos como trabajo hecho.
      await logActivity(req, {
        action: "international_purchases.tracking_refreshed",
        entityType: "shipment",
        entityId: null,
        detail: {
          trigger: "manual_refresh",
          filters: req.body?.filters || {},
        },
      });

      return res.json({
        success: true,
        message:
          "Actualización iniciada. Los embarques se refrescarán en unos momentos.",
        trackingWorkflow,
      });
    } catch (error) {
      return res
        .status(500)
        .json(
          buildErrorResponse(
            "Error al activar tracking de Compras Internacionales",
            error,
          ),
        );
    }
  },
);

router.get("/international-purchases/shipments", ...guard, async (req, res) => {
  try {
    const {
      search,
      status,
      providerType,
      sourceType,
      reviewStatus,
      eta,
      proveedor,
      factura_codigo,
      sortBy,
      sortDir,
      page = "1",
      limit = "25",
    } = req.query;

    const filterErrors = validateShipmentFilters({
      search,
      status,
      providerType,
      sourceType,
      reviewStatus,
      eta,
    });

    if (filterErrors.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Filtros inválidos para consultar embarques.",
        errors: filterErrors,
      });
    }

    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
    const limitNumber = Math.min(Math.max(parseInt(limit, 10) || 25, 1), 100);
    const offset = (pageNumber - 1) * limitNumber;

    const values = [];
    const filters = [];

    function addFilter(sqlFragment, value) {
      values.push(value);
      filters.push(sqlFragment.replace("?", `$${values.length}`));
    }

    if (search && String(search).trim() !== "") {
      const normalizedSearch = `%${String(search).trim()}%`;

      values.push(normalizedSearch);
      const searchParam = `$${values.length}`;

      filters.push(`
        (
          v.tracking_key ILIKE ${searchParam}
          OR v.tracking_provider_name ILIKE ${searchParam}
          OR v.scac ILIKE ${searchParam}
          OR v.carrier ILIKE ${searchParam}
          OR v.terminal ILIKE ${searchParam}
          OR v.agency ILIKE ${searchParam}
          OR v.material_description ILIKE ${searchParam}
          OR v.supplier_name ILIKE ${searchParam}
          OR v.invoice_code ILIKE ${searchParam}
        )
      `);
    }

    if (status && String(status).trim() !== "") {
      addFilter("v.shipment_status = ?", String(status).trim().toUpperCase());
    }

    // Un embarque DISCARDED es basura o un duplicado que el operador aparto sin
    // borrar la fila, para conservar la traza. Se oculta del listado salvo que
    // se pida explicitamente, que es la unica forma de volver a verlo.
    if (reviewStatus && String(reviewStatus).trim() !== "") {
      addFilter("v.review_status = ?", String(reviewStatus).trim().toUpperCase());
    } else {
      filters.push("v.review_status <> 'DISCARDED'");
    }

    if (providerType && String(providerType).trim() !== "") {
      addFilter(
        "v.tracking_provider_type = ?",
        String(providerType).trim().toUpperCase(),
      );
    }

    if (eta && String(eta).trim() !== "") {
      addFilter("v.eta = ?::date", String(eta).trim());
    }

    if (factura_codigo && String(factura_codigo).trim() !== "") {
      const normalized = `%${String(factura_codigo).trim()}%`;
      addFilter("v.invoice_code ILIKE ?", normalized);
    }

    if (sourceType && String(sourceType).trim() !== "") {
      addFilter("v.source_type = ?", String(sourceType).trim().toUpperCase());
    }

    // La vista ya expone las 10 columnas que antes obligaban a unirse otra vez a
    // shipments (review_status, warnings, custom_fields y compania).
    const fromSql = `
      FROM audit_portal.v_international_purchases_shipments_web v
    `;

    const whereSql =
      filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";

    const SORTABLE_COLUMNS = {
      tracking_key: "v.tracking_key",
      supplier_name: "v.supplier_name",
      invoice_code: "v.invoice_code",
      container_count: "v.container_count",
      scac: "v.scac",
      shipment_status: "v.shipment_status",
      terminal: "v.terminal",
      eta: "v.eta",
      etd: "v.etd",
      ata: "v.ata",
      atd: "v.atd",
      updated_at: "v.updated_at",
    };

    const sortColumn = SORTABLE_COLUMNS[sortBy] || "v.updated_at";
    const sortDirection =
      String(sortDir).toLowerCase() === "asc" ? "ASC" : "DESC";
    const orderBySql =
      sortColumn === "v.updated_at"
        ? `ORDER BY v.updated_at ${sortDirection}, v.tracking_key ASC`
        : `ORDER BY ${sortColumn} ${sortDirection} NULLS LAST, v.updated_at DESC`;

    const countResult = await pool.query(
      `
        SELECT COUNT(*)::INT AS total
        ${fromSql}
        ${whereSql};
      `,
      values,
    );

    const dataValues = [...values, limitNumber, offset];

    const dataResult = await pool.query(
      `
        SELECT
          v.process_code,
          v.shipment_id,
          v.tracking_key,

          v.tracking_reference_type,

          v.tracking_provider_type,
          v.tracking_provider_name,
          v.scac,

          v.carrier,

          v.supplier_name,
          v.invoice_code,
          v.review_status,
          v.reviewed_by,
          v.reviewed_at,

          v.agency,
          v.material_description,

          v.container_count,

          v.terminal,

          v.etd,
          v.eta,
          v.atd,
          v.ata,

          v.shipment_status,

          v.warnings,
          v.last_tracking_error,
          v.last_tracking_error_at,
          v.custom_fields,

          v.source_type,
          v.tracking_enabled,

          v.portal_created_by,
          v.portal_notes,

          v.primary_reference_type,
          v.primary_reference_value,
          v.eta_status,
          v.days_to_eta,

          v.shipment_type,

          v.updated_at
        ${fromSql}
        ${whereSql}
        ${orderBySql}
        LIMIT $${values.length + 1}
        OFFSET $${values.length + 2};
      `,
      dataValues,
    );

    const total = countResult.rows[0]?.total || 0;
    const totalPages = Math.ceil(total / limitNumber);

    return res.json({
      success: true,
      data: dataResult.rows,
      pagination: {
        page: pageNumber,
        limit: limitNumber,
        total,
        totalPages,
      },
      filters: {
        search: search || null,
        status: status || null,
        providerType: providerType || null,
        sourceType: sourceType || null,
        proveedor: proveedor || null,
        factura_codigo: factura_codigo || null,
      },
      permissions: {
        // requireProcess deja el registro tal cual sale de la base, en snake_case.
        canExport: req.processAccess?.can_export === true,
      },
    });
  } catch (error) {
    return res
      .status(500)
      .json(
        buildErrorResponse(
          "Error al consultar embarques de Compras Internacionales",
          error,
        ),
      );
  }
});

router.get("/international-purchases/warning-catalog", ...guard, async (req, res) => {
  try {

    const result = await pool.query(
      `
        SELECT
          code,
          label_es,
          label_en,
          severity
        FROM international_purchases.warning_catalog
        ORDER BY code ASC;
      `
    );

    return res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    return res
      .status(500)
      .json(
        buildErrorResponse(
          "Error al consultar el catálogo de warnings de Compras Internacionales",
          error,
        ),
      );
  }
});


// Mismo handler que el del router publico. Lo que cambia es el guard.
router.get("/international-purchases/scac-catalog", ...guard, scacCatalogHandler);


router.put(
  "/international-purchases/shipments/:shipmentId",
  ...writeGuard,
  async (req, res) => {
    const shipmentId = String(req.params.shipmentId || "").trim();
    let client;

    try {
      if (!UUID_REGEX.test(shipmentId)) {
        return res.status(400).json({
          success: false,
          message: "Identificador de embarque inválido.",
        });
      }

      const trackingKey = normalizeTrackingKey(req.body.tracking_key);
      const trackingReferenceType = normalizeUpper(req.body.tracking_reference_type);
      const trackingProviderType = normalizeUpper(req.body.tracking_provider_type);
      const trackingProviderName = cleanText(req.body.tracking_provider_name);
      const scac = normalizeScac(req.body.scac);
      const portalNotes = cleanText(req.body.portal_notes);
      const supplierName = cleanText(req.body.supplier_name);
      const invoiceCode = cleanText(req.body.invoice_code);
      const agency = cleanText(req.body.agency);
      const materialDescription = cleanText(req.body.material_description);
      const containerCount = toInteger(req.body.container_count);
      const customFields = sanitizeCustomFields(req.body.custom_fields);

      const validationErrors = validateRequiredFields({
        trackingKey,
        trackingProviderType,
        trackingProviderName,
        scac,
      });

      if (validationErrors.length > 0) {
        return res.status(400).json({
          success: false,
          message: "Datos inválidos para actualizar el embarque.",
          errors: validationErrors,
        });
      }

      // Antes de abrir la transaccion: no tiene sentido tomar una conexion y un
      // FOR UPDATE sobre la fila para descubrir despues que el SCAC no sirve.
      const scacError = await scacValidationError(scac);

      if (scacError) {
        return res.status(400).json({
          success: false,
          message: "Datos inválidos para actualizar el embarque.",
          errors: [scacError],
        });
      }

      client = await pool.connect();
      await client.query("BEGIN");

      // Se bloquea la fila y se lee la referencia ANTERIOR antes de escribirla: es lo
      // que permite distinguir una correccion de MBL de una edicion cualquiera, y
      // evita que dos ediciones simultaneas se pisen.
      const actual = await client.query(
        `SELECT tracking_key
           FROM international_purchases.shipments
          WHERE shipment_id = $1
          FOR UPDATE;`,
        [shipmentId],
      );

      if (actual.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({
          success: false,
          message: "El embarque indicado no existe.",
        });
      }

      const claveAnterior = actual.rows[0].tracking_key;
      const claveCorregida = claveAnterior !== trackingKey;

      const result = await client.query(
        `
        UPDATE international_purchases.shipments
        SET
          tracking_key = $12,

          -- Aqui se anulaba la columna espejo bl al corregir la referencia. Ya no
          -- se nombra (Paso A, ver el comentario del INSERT). Consecuencia asumida:
          -- entre este despliegue y el DROP COLUMN del Paso B, corregir el MBL de
          -- una de las 3 filas heredadas que aun tienen bl deja ese espejo
          -- apuntando a la clave vieja. Es inerte --nadie lee la columna, ni el
          -- portal ni el flujo de tracking de n8n-- y el Paso B se la lleva entera.
          tracking_provider_type = $1,
          tracking_provider_name = $2,
          scac = $3,
          carrier = CASE WHEN $1 = 'NAVIERA' THEN $2 ELSE NULL END,
          supplier_name = $4,
          invoice_code = $5,
          agency = $6,
          material_description = $7,
          container_count = $8,
          portal_notes = $9,
          custom_fields = $11::jsonb
        WHERE shipment_id = $10
        RETURNING
          shipment_id,
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
          warnings,
          source_type,
          shipment_status,
          shipment_type,
          tracking_enabled,
          portal_created_by,
          portal_notes,
          custom_fields,
          updated_at;
      `,
        [
          trackingProviderType,
          trackingProviderName,
          scac,
          supplierName,
          invoiceCode,
          agency,
          materialDescription,
          containerCount,
          portalNotes,
          shipmentId,
          JSON.stringify(customFields),
          trackingKey,
        ],
      );

      // El historial pertenece a la referencia con la que se recolecto. Si la
      // referencia era incorrecta, esos eventos son de OTRO embarque y arrastrarlos
      // solo confunde: se purgan y el tracking se reconstruye desde cero.
      if (claveCorregida) {
        await client.query(
          `DELETE FROM international_purchases.shipment_tracking_history
            WHERE shipment_id = $1;`,
          [shipmentId],
        );
      }

      await client.query("COMMIT");

      const shipment = result.rows[0];

      // A partir de aqui nada puede deshacer la transaccion: el aviso a n8n y la
      // auditoria son best-effort y no deben tumbar una correccion ya confirmada.
      let trackingWorkflow = null;

      if (claveCorregida) {
        await logActivity(req, {
          action: "international_purchases.shipment_key_corrected",
          entityType: "shipment",
          entityId: shipmentId,
          detail: {
            claveAnterior,
            claveNueva: trackingKey,
            scac,
            historialPurgado: true,
          },
        });

        // n8n no guarda estado por tracking_key: relee la referencia de
        // v_active_shipments_for_tracking en cada corrida y actualiza por
        // shipment_id. Esta llamada no le "avisa" del cambio, simplemente adelanta el
        // sondeo para que el embarque corregido se rastree ya y no en la corrida de
        // las 9:00. Por eso un fallo aqui no es grave.
        trackingWorkflow = await triggerInternationalPurchasesTracking({
          trigger: "shipment_key_corrected",
          source: "portal",
          requestedAt: new Date().toISOString(),
          requestedBy: {
            userId: req.user.userId,
            username: req.user.username,
            displayName: req.user.displayName,
            email: req.user.email,
          },
          shipment: {
            shipmentId,
            previousTrackingKey: claveAnterior,
            trackingKey: shipment.tracking_key,
            trackingReferenceType: shipment.tracking_reference_type,
            trackingProviderType: shipment.tracking_provider_type,
            trackingProviderName: shipment.tracking_provider_name,
            scac: shipment.scac,
          },
        });
      }

      return res.json({
        success: true,
        message: claveCorregida
          ? "Embarque actualizado. Se corrigió la referencia, se descartó el historial de rastreo anterior y se solicitó un nuevo rastreo."
          : "Embarque actualizado correctamente.",
        data: shipment,
        referenceChanged: claveCorregida,
        ...(trackingWorkflow ? { trackingWorkflow } : {}),
      });
    } catch (error) {
      if (client) {
        try { await client.query("ROLLBACK"); } catch (_) { /* ignorar */ }
      }

      const mapped = mapPgError(error, {
        23505: "Ya existe otro embarque con esa referencia.",
      });
      if (mapped) return res.status(mapped.status).json(mapped.body);

      return res
        .status(500)
        .json(
          buildErrorResponse(
            "Error al actualizar el embarque de Compras Internacionales",
            error,
          ),
        );
    } finally {
      if (client) client.release();
    }
  },
);

router.delete(
  "/international-purchases/shipments/:shipmentId",
  ...writeGuard,
  async (req, res) => {
    const shipmentId = String(req.params.shipmentId || "").trim();
    let client;

    try {
      if (!UUID_REGEX.test(shipmentId)) {
        return res.status(400).json({
          success: false,
          message: "Identificador de embarque inválido.",
        });
      }

      client = await pool.connect();

      await client.query("BEGIN");

      await client.query(
        `DELETE FROM international_purchases.shipment_tracking_history WHERE shipment_id = $1;`,
        [shipmentId],
      );

      // El RETURNING trae mas que el id a proposito: el borrado es fisico y
      // despues del COMMIT no queda donde consultar que embarque era. Estos
      // campos son la unica descripcion que sobrevive, en el detail del log.
      const result = await client.query(
        `DELETE FROM international_purchases.shipments
          WHERE shipment_id = $1
          RETURNING shipment_id, tracking_key, tracking_reference_type, scac,
                    supplier_name, invoice_code;`,
        [shipmentId],
      );

      if (result.rowCount === 0) {
        await client.query("ROLLBACK");

        return res.status(404).json({
          success: false,
          message: "El embarque indicado no existe.",
        });
      }

      await client.query("COMMIT");

      const borrado = result.rows[0];

      // Despues del COMMIT, nunca dentro de la transaccion: logActivity usa el
      // pool y no este client, asi que meterlo antes lo dejaria fuera del
      // rollback igualmente, pero registrando un borrado que pudo no ocurrir.
      await logActivity(req, {
        action: "international_purchases.shipment_deleted",
        entityType: "shipment",
        entityId: borrado.shipment_id,
        detail: {
          trackingKey: borrado.tracking_key,
          trackingReferenceType: borrado.tracking_reference_type,
          scac: borrado.scac,
          supplierName: borrado.supplier_name,
          invoiceCode: borrado.invoice_code,
          historialPurgado: true,
        },
      });

      return res.json({
        success: true,
        message: "Embarque eliminado correctamente.",
      });
    } catch (error) {
      if (client) {
        try { await client.query("ROLLBACK"); } catch (_) { /* ignorar */ }
      }

      const mapped = mapPgError(error, {
        23503: "No se puede eliminar el embarque porque otros registros dependen de el.",
      });
      if (mapped) return res.status(mapped.status).json(mapped.body);

      return res
        .status(500)
        .json(
          buildErrorResponse(
            `Error al eliminar el embarque ${shipmentId} de Compras Internacionales`,
            error,
          ),
        );
    } finally {
      if (client) client.release();
    }
  },
);

module.exports = router;
