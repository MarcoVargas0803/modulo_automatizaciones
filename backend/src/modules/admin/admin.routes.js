const express = require("express");
const bcrypt = require("bcryptjs");
const pool = require("../../shared/db/pool");
const env = require("../../shared/config/env");
const { requireAuth } = require("../../shared/middlewares/auth.middleware");
const { requireCsrf } = require("../../shared/middlewares/csrf.middleware");
const { requireProcess } = require("../../shared/middlewares/access.middleware");
const { adminActionLimiter } = require("../../shared/middlewares/rate-limit.middleware");
const { revokeUserSessions } = require("../../shared/services/session.service");
const { buildErrorResponse } = require("../../shared/utils/errorResponse");
const { logActivity } = require("../../shared/utils/activityLog");
const { rowsToCsv } = require("../../shared/utils/csv");
const { parsePositiveInt } = require("../../shared/utils/parsePositiveInt");

const router = express.Router();

const PROCESS_CODE = "admin";
const SALT_ROUNDS = 10;
const MIN_PASSWORD_LENGTH = 10;
const USERNAME_REGEX = /^[a-z0-9_]{3,50}$/;

// Roles asignables por proceso. Es la lista que ve la pantalla de
// Administracion, asi que un rol que falte aqui NO se puede dar de alta aunque
// los gates del modulo lo reconozcan.
//
// Solo estan los procesos que este portal sirve. Un proceso que siga vivo en
// audit_portal.processes pero no tenga aqui su entrada no admite rol: se le da
// acceso sin rol, que es lo correcto mientras su modulo no exista en este
// repositorio. Al reincorporar un modulo, su fila vuelve aqui.
const VALID_ROLES = {
  international_purchases: ["auditor_maestro"],
  material_revaluation: ["auditor_maestro"],
};

const guard = [requireAuth, requireProcess(PROCESS_CODE)];
const writeGuard = [...guard, requireCsrf, adminActionLimiter];

const parseUserId = parsePositiveInt;

function validateAccessEntries(entries) {
  if (!Array.isArray(entries)) {
    return { error: "Los accesos deben venir en una lista" };
  }

  const clean = [];

  for (const entry of entries) {
    const processCode = String(entry?.process_code || "").trim();

    if (!processCode) {
      return { error: "Cada acceso requiere un process_code" };
    }

    const role = entry?.role ? String(entry.role).trim() : null;
    const allowed = VALID_ROLES[processCode];

    if (allowed && !allowed.includes(role)) {
      return {
        error: `El proceso ${processCode} requiere uno de estos roles: ${allowed.join(", ")}`,
      };
    }

    if (!allowed && role) {
      return { error: `El proceso ${processCode} no admite roles` };
    }

    clean.push({
      processCode,
      role,
      canView: entry?.can_view !== false,
      canExport: entry?.can_export === true,
    });
  }

  return { entries: clean };
}

router.get("/admin/users", ...guard, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.user_id, u.username, u.display_name, u.email, u.is_active,
              u.created_at, u.updated_at, u.last_login_at, u.access
         FROM audit_portal.v_admin_users_web u
        ORDER BY u.is_active DESC, u.username;`,
    );

    return res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error("Error al consultar los usuarios:", error);
    return res
      .status(500)
      .json(buildErrorResponse("Error al consultar los usuarios", error));
  }
});

router.post("/admin/users", ...writeGuard, async (req, res) => {
  const username = String(req.body?.username || "").trim().toLowerCase();
  const displayName = String(req.body?.display_name || "").trim();
  const email = req.body?.email ? String(req.body.email).trim() : null;
  const password = String(req.body?.password || "");

  if (!USERNAME_REGEX.test(username)) {
    return res.status(400).json({
      success: false,
      message: "El usuario debe tener de 3 a 50 caracteres: minusculas, numeros y guion bajo",
    });
  }

  if (displayName.length < 3) {
    return res.status(400).json({
      success: false,
      message: "El nombre para mostrar debe tener al menos 3 caracteres",
    });
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({
      success: false,
      message: `La contrasena debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`,
    });
  }

  const { entries, error } = validateAccessEntries(req.body?.access || []);

  if (error) {
    return res.status(400).json({ success: false, message: error });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const inserted = await client.query(
      `INSERT INTO audit_portal.users (username, display_name, email, password_hash, is_active)
       VALUES ($1, $2, $3, $4, TRUE)
       RETURNING user_id, username, display_name, email, is_active, created_at;`,
      [username, displayName, email, passwordHash],
    );

    const user = inserted.rows[0];

    for (const entry of entries) {
      await client.query(
        `INSERT INTO audit_portal.user_process_access
           (user_id, process_code, role, can_view, can_export)
         VALUES ($1, $2, $3, $4, $5);`,
        [user.user_id, entry.processCode, entry.role, entry.canView, entry.canExport],
      );
    }

    await client.query("COMMIT");

    await logActivity(req, {
      action: "admin.user_created",
      entityType: "user",
      entityId: user.user_id,
      detail: { username, displayName, access: entries },
    });

    return res.status(201).json({ success: true, data: user });
  } catch (error) {
    await client.query("ROLLBACK");

    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "Ya existe un usuario con ese nombre o correo",
      });
    }

    if (error.code === "23503") {
      return res.status(400).json({
        success: false,
        message: "Alguno de los procesos indicados no existe",
      });
    }

    console.error("Error al crear el usuario:", error);
    return res.status(500).json(buildErrorResponse("Error al crear el usuario", error));
  } finally {
    client.release();
  }
});

router.put("/admin/users/:id", ...writeGuard, async (req, res) => {
  const userId = parseUserId(req.params.id);

  if (!userId) {
    return res.status(400).json({ success: false, message: "Usuario no valido" });
  }

  const isActive = req.body?.is_active;

  // Un administrador que se desactiva a si mismo deja el portal sin quien administre.
  if (isActive === false && String(userId) === String(req.user.userId)) {
    return res.status(409).json({
      success: false,
      message: "No puedes desactivar tu propio usuario",
    });
  }

  try {
    const current = await pool.query(
      `SELECT user_id, username, display_name, email, is_active
         FROM audit_portal.users WHERE user_id = $1;`,
      [userId],
    );

    if (current.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Usuario no encontrado" });
    }

    const previous = current.rows[0];
    const displayName =
      req.body?.display_name !== undefined
        ? String(req.body.display_name).trim()
        : previous.display_name;
    const email =
      req.body?.email !== undefined
        ? String(req.body.email).trim() || null
        : previous.email;
    const targetActive = isActive !== undefined ? Boolean(isActive) : previous.is_active;

    if (displayName.length < 3) {
      return res.status(400).json({
        success: false,
        message: "El nombre para mostrar debe tener al menos 3 caracteres",
      });
    }

    const result = await pool.query(
      `UPDATE audit_portal.users
          SET display_name = $2, email = $3, is_active = $4, updated_at = NOW()
        WHERE user_id = $1
        RETURNING user_id, username, display_name, email, is_active, updated_at;`,
      [userId, displayName, email, targetActive],
    );

    if (previous.is_active && !targetActive) {
      await revokeUserSessions(pool, userId, "user_deactivated");
    }

    await logActivity(req, {
      action: targetActive === previous.is_active
        ? "admin.user_updated"
        : targetActive
          ? "admin.user_activated"
          : "admin.user_deactivated",
      entityType: "user",
      entityId: userId,
      detail: { username: previous.username, displayName, email, isActive: targetActive },
    });

    return res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "Ya existe otro usuario con ese correo",
      });
    }

    console.error("Error al actualizar el usuario:", error);
    return res
      .status(500)
      .json(buildErrorResponse("Error al actualizar el usuario", error));
  }
});

router.post("/admin/users/:id/password", ...writeGuard, async (req, res) => {
  const userId = parseUserId(req.params.id);
  const password = String(req.body?.password || "");

  if (!userId) {
    return res.status(400).json({ success: false, message: "Usuario no valido" });
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({
      success: false,
      message: `La contrasena debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`,
    });
  }

  try {
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const result = await pool.query(
      `UPDATE audit_portal.users
          SET password_hash = $2, updated_at = NOW()
        WHERE user_id = $1
        RETURNING user_id, username;`,
      [userId, passwordHash],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Usuario no encontrado" });
    }

    // Una contrasena se restablece, tipicamente, porque se filtro. Dejar viva la
    // sesion abierta con la contrasena vieja anularia el motivo del cambio.
    await revokeUserSessions(pool, userId, "admin");

    await logActivity(req, {
      action: "admin.password_reset",
      entityType: "user",
      entityId: userId,
      detail: { username: result.rows[0].username },
    });

    return res.json({
      success: true,
      message: `Contrasena actualizada para ${result.rows[0].username}`,
    });
  } catch (error) {
    console.error("Error al actualizar la contrasena:", error);
    return res
      .status(500)
      .json(buildErrorResponse("Error al actualizar la contrasena", error));
  }
});

router.post("/admin/users/:id/logout", ...writeGuard, async (req, res) => {
  const userId = parseUserId(req.params.id);

  if (!userId) {
    return res.status(400).json({ success: false, message: "Usuario no valido" });
  }

  try {
    const current = await pool.query(
      "SELECT username FROM audit_portal.users WHERE user_id = $1;",
      [userId],
    );

    if (current.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Usuario no encontrado" });
    }

    const revoked = await revokeUserSessions(pool, userId, "admin");

    await logActivity(req, {
      action: "admin.user_sessions_revoked",
      entityType: "user",
      entityId: userId,
      detail: { username: current.rows[0].username, revoked },
    });

    return res.json({
      success: true,
      // Cero sesiones revocadas no es un error: el usuario simplemente no tenia
      // ninguna abierta. La UI lo distingue para no decir "sesion cerrada" cuando
      // no habia nada que cerrar.
      revoked,
      message: revoked
        ? `Se cerro la sesion de ${current.rows[0].username}`
        : `${current.rows[0].username} no tenia ninguna sesion abierta`,
    });
  } catch (error) {
    console.error("Error al cerrar la sesion del usuario:", error);
    return res
      .status(500)
      .json(buildErrorResponse("Error al cerrar la sesion del usuario", error));
  }
});

router.put("/admin/users/:id/access", ...writeGuard, async (req, res) => {
  const userId = parseUserId(req.params.id);

  if (!userId) {
    return res.status(400).json({ success: false, message: "Usuario no valido" });
  }

  const { entries, error } = validateAccessEntries(req.body?.access || []);

  if (error) {
    return res.status(400).json({ success: false, message: error });
  }

  // Quitarse a uno mismo el proceso admin deja el portal sin administrador accesible.
  if (
    String(userId) === String(req.user.userId) &&
    !entries.some((entry) => entry.processCode === PROCESS_CODE && entry.canView)
  ) {
    return res.status(409).json({
      success: false,
      message: "No puedes quitarte tu propio acceso de administracion",
    });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const exists = await client.query(
      "SELECT username FROM audit_portal.users WHERE user_id = $1 FOR UPDATE;",
      [userId],
    );

    if (exists.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, message: "Usuario no encontrado" });
    }

    await client.query(
      "DELETE FROM audit_portal.user_process_access WHERE user_id = $1;",
      [userId],
    );

    for (const entry of entries) {
      await client.query(
        `INSERT INTO audit_portal.user_process_access
           (user_id, process_code, role, can_view, can_export)
         VALUES ($1, $2, $3, $4, $5);`,
        [userId, entry.processCode, entry.role, entry.canView, entry.canExport],
      );
    }

    await client.query("COMMIT");

    await logActivity(req, {
      action: "admin.access_updated",
      entityType: "user",
      entityId: userId,
      detail: { username: exists.rows[0].username, access: entries },
    });

    return res.json({ success: true, message: "Permisos actualizados" });
  } catch (error) {
    await client.query("ROLLBACK");

    if (error.code === "23503") {
      return res.status(400).json({
        success: false,
        message: "Alguno de los procesos indicados no existe",
      });
    }

    console.error("Error al actualizar los permisos:", error);
    return res
      .status(500)
      .json(buildErrorResponse("Error al actualizar los permisos", error));
  } finally {
    client.release();
  }
});

router.get("/admin/processes", ...guard, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.process_code, p.process_name, p.description, p.is_active, p.user_count
         FROM audit_portal.v_admin_processes_web p
        ORDER BY p.process_name;`,
    );

    return res.json({
      success: true,
      data: result.rows.map((row) => ({
        ...row,
        valid_roles: VALID_ROLES[row.process_code] || null,
      })),
    });
  } catch (error) {
    console.error("Error al consultar los procesos:", error);
    return res
      .status(500)
      .json(buildErrorResponse("Error al consultar los procesos", error));
  }
});

router.put("/admin/processes/:code", ...writeGuard, async (req, res) => {
  const processCode = String(req.params.code || "").trim();
  const isActive = Boolean(req.body?.is_active);

  if (processCode === PROCESS_CODE && !isActive) {
    return res.status(409).json({
      success: false,
      message: "El proceso de administracion no se puede desactivar",
    });
  }

  try {
    const result = await pool.query(
      `UPDATE audit_portal.processes
          SET is_active = $2, updated_at = NOW()
        WHERE process_code = $1
        RETURNING process_code, process_name, is_active;`,
      [processCode, isActive],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Proceso no encontrado" });
    }

    await logActivity(req, {
      action: isActive ? "admin.process_enabled" : "admin.process_disabled",
      entityType: "process",
      entityId: processCode,
      detail: { processName: result.rows[0].process_name },
    });

    return res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error("Error al actualizar el proceso:", error);
    return res
      .status(500)
      .json(buildErrorResponse("Error al actualizar el proceso", error));
  }
});

// Compartido entre la consulta paginada y la exportacion a CSV: mismos filtros, mismo
// orden de parametros, para que "lo que ves en pantalla" y "lo que exportas" coincidan.
function buildActivityFilters(query) {
  const values = [];
  const filters = [];

  if (query.username) {
    values.push(String(query.username).trim());
    filters.push(`a.username = $${values.length}`);
  }

  if (query.action) {
    values.push(`${String(query.action).trim()}%`);
    filters.push(`a.action LIKE $${values.length}`);
  }

  if (query.dateFrom) {
    values.push(String(query.dateFrom).trim());
    filters.push(`a.created_at >= $${values.length}::date`);
  }

  if (query.dateTo) {
    values.push(String(query.dateTo).trim());
    filters.push(`a.created_at < $${values.length}::date + INTERVAL '1 day'`);
  }

  return { values, filters };
}

router.get("/admin/activity", ...guard, async (req, res) => {
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 100, 1), 500);
  const { values, filters } = buildActivityFilters(req.query);

  values.push(limit);

  try {
    const result = await pool.query(
      `SELECT a.activity_id, a.user_id, a.username, a.action, a.entity_type,
              a.entity_id, a.detail, a.ip, a.created_at
         FROM audit_portal.v_admin_activity_web a
        ${filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : ""}
        ORDER BY a.activity_id DESC
        LIMIT $${values.length};`,
      values,
    );

    return res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error("Error al consultar la bitacora:", error);
    return res
      .status(500)
      .json(buildErrorResponse("Error al consultar la bitacora", error));
  }
});


router.get("/admin/activity/export.csv", ...guard, async (req, res) => {
  const { values, filters } = buildActivityFilters(req.query);
  values.push(5000);

  try {
    const result = await pool.query(
      `SELECT a.activity_id, a.created_at, a.username, a.action, a.entity_type,
              a.entity_id, a.ip, a.detail
         FROM audit_portal.v_admin_activity_web a
        ${filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : ""}
        ORDER BY a.activity_id DESC
        LIMIT $${values.length};`,
      values,
    );

    const csv = `﻿${rowsToCsv(result.rows).replace(/\n/g, "\r\n")}\r\n`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="bitacora_${new Date().toISOString().slice(0, 10)}.csv"`,
    );
    res.setHeader("X-Content-Type-Options", "nosniff");
    return res.send(csv);
  } catch (error) {
    console.error("Error al exportar la bitacora:", error);
    return res
      .status(500)
      .json(buildErrorResponse("Error al exportar la bitacora", error));
  }
});

router.get("/admin/health", ...guard, async (req, res) => {
  const database = { ok: false };

  try {
    const result = await pool.query(
      "SELECT version() AS version, NOW() AS server_time;",
    );
    database.ok = true;
    database.version = result.rows[0].version.split(",")[0];
    database.serverTime = result.rows[0].server_time;
    database.pool = { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount };
  } catch (error) {
    
    console.error("[admin/health] Fallo la comprobacion de la base de datos:", error);
  }

  // Solo se informa si el webhook esta configurado. La URL nunca sale del servidor.
  const webhooks = {
    internationalPurchases: Boolean(env.n8n.internationalPurchasesWebhookUrl),
    materialRevaluation: Boolean(env.n8n.materialRevaluationWebhookUrl),
    forwarderInvite: Boolean(env.n8n.forwarderInviteWebhookUrl),
    incomingTokenConfigured: Boolean(env.n8n.webhookAuthToken),
  };

  const counters = { ok: false };

  try {
    const result = await pool.query(
      `SELECT
         (SELECT COUNT(*)::INT FROM audit_portal.users WHERE is_active) AS usuarios_activos,
         (SELECT COUNT(*)::INT FROM audit_portal.processes WHERE is_active) AS procesos_activos,
         (SELECT COUNT(*)::INT FROM audit_portal.activity_log) AS eventos_bitacora;`,
    );
    Object.assign(counters, result.rows[0], { ok: true });
  } catch (error) {
    // Mismo criterio que el catch de la comprobacion de base de datos: al log el
    // detalle, a la respuesta solo `ok: false`.
    console.error("[admin/health] Fallo la consulta de contadores:", error);
  }

  return res.json({
    success: true,
    data: {
      environment: env.nodeEnv,
      uptimeSeconds: Math.round(process.uptime()),
      database,
      webhooks,
      counters,
    },
  });
});

module.exports = router;
