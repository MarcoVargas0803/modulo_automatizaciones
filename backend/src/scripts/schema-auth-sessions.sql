-- ============================================================
-- ESQUEMA: audit_portal — sesiones de usuario
-- Fecha: 2026-08-10
--
-- Una fila por sesión abierta. Es la pieza que faltaba para poder detectar y
-- cortar el uso simultáneo de una misma cuenta desde varios dispositivos.
--
-- POR QUÉ EXISTE. Hasta ahora NO había sesión de servidor: el JWT dentro de la
-- cookie *era* la sesión. requireAuth verificaba firma + is_active y nada más,
-- así que la base de datos no sabía en ningún momento quién estaba conectado.
-- De ahí salían dos agujeros:
--
--   * El control de duplicidad de auth.routes.js leía la cookie del PROPIO
--     solicitante, así que por construcción solo veía el mismo navegador. Entre
--     dispositivos distintos no había nada que comparar.
--   * El logout solo borraba la cookie del cliente. Un token copiado —o el del
--     dispositivo al que se pretendía expulsar— seguía siendo válido hasta su
--     `exp`, porque ninguna petición consultaba nada revocable.
--
-- Con esta tabla el JWT lleva un `sid` que requireAuth contrasta contra la fila
-- en CADA petición. Eso es lo que convierte la expulsión en efectiva: revocar
-- la fila invalida el token en el acto, sin esperar a que caduque.
--
-- POR QUÉ NO UN BOOLEANO EN users. La alternativa evaluada era
-- users.is_initiated. No tiene vía de liberación: la cookie de sesión no lleva
-- maxAge a propósito, así que al cerrar el navegador la sesión muere en el
-- cliente pero NUNCA se llama a /auth/logout, que sería el único punto capaz de
-- devolver el flag a false. El usuario quedaba autobloqueado de su propia
-- cuenta hasta que alguien entrara por SQL. Un booleano tampoco lleva dueño,
-- caducidad ni marca de actividad, así que no permite reclamar una sesión
-- abandonada ni auditar nada — y seguía sin cerrar el segundo agujero, porque
-- solo gateaba el login.
--
-- DOS PREDICADOS DISTINTOS, y confundirlos introduce una regresión:
--
--   * VALIDEZ (la usa requireAuth):  revoked_at IS NULL AND expires_at > now()
--     La inactividad NO invalida. Si invalidara, el JWT de 8 h se convertiría de
--     facto en un timeout de 15 min y expulsaría a quien lleve un rato leyendo
--     un reporte.
--   * BLOQUEO (lo usa el login):     lo anterior + last_seen_at reciente
--     Solo una sesión con actividad reciente provoca el 409 de conflicto. Una
--     sesión válida pero ociosa no bloquea: el login nuevo entra y la revoca.
--     Es justo lo que evita el autobloqueo del booleano.
--
-- RETENCIÓN. Las filas revocadas o vencidas no se borran: son el rastro de
-- auditoría que permite ver que una cuenta se usó desde dos sitios. No hay
-- planificador en el proyecto y no se introduce uno; la purga, si algún día
-- hace falta, es un DELETE manual sobre expires_at.
-- ============================================================

-- ─── Tabla ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS audit_portal.user_sessions (
  -- Generado en Node con crypto.randomUUID() y embebido en el JWT como `sid`.
  -- No se usa DEFAULT gen_random_uuid(): el valor tiene que existir ANTES del
  -- INSERT para poder firmar el token con él.
  session_id     uuid PRIMARY KEY,

  -- ON DELETE CASCADE porque admin.routes.js borra usuarios: sin él, el DELETE
  -- fallaría por la FK y el borrado de usuarios dejaría de funcionar.
  user_id        bigint NOT NULL
                 REFERENCES audit_portal.users(user_id) ON DELETE CASCADE,

  issued_at      timestamptz NOT NULL DEFAULT now(),

  -- Espejo exacto del `exp` del JWT: se rellena leyendo el token ya firmado, no
  -- reinterpretando JWT_EXPIRES_IN. Una sola fuente de verdad para la caducidad.
  expires_at     timestamptz NOT NULL,

  -- Lo refresca requireAuth como mucho una vez por minuto y por sesión (va
  -- atado al TTL de su caché en memoria). Solo interviene en el predicado de
  -- BLOQUEO, nunca en el de validez.
  last_seen_at   timestamptz NOT NULL DEFAULT now(),

  revoked_at     timestamptz,
  revoked_reason text,

  -- Contexto para que el usuario legítimo pueda reconocer —o no— el acceso que
  -- le desplazó. `ip` es inet igual que en activity_log.
  ip             inet,
  user_agent     text,

  -- Los cuatro motivos son los únicos que escribe el código. Va junto con la
  -- coherencia de que un motivo sin fecha (o al revés) es un estado imposible.
  CONSTRAINT user_sessions_revoked_reason_check
    CHECK (revoked_reason IS NULL OR revoked_reason IN (
      'logout', 'replaced', 'admin', 'user_deactivated'
    )),
  CONSTRAINT user_sessions_revoked_coherent_check
    CHECK ((revoked_at IS NULL) = (revoked_reason IS NULL))
);

-- ─── Índices ─────────────────────────────────────────────────

-- Índice parcial: la consulta del login busca SIEMPRE sesiones vivas de un
-- usuario, y las revocadas —que con el tiempo son la mayoría— no entran en el
-- índice. requireAuth no lo necesita: busca por session_id, que es la PK.
CREATE INDEX IF NOT EXISTS user_sessions_live_by_user_idx
  ON audit_portal.user_sessions (user_id)
  WHERE revoked_at IS NULL;

-- ─── Permisos ────────────────────────────────────────────────

-- OJO: a diferencia del resto de objetos de audit_portal, que solo se leen,
-- aquí el backend ESCRIBE (crea sesiones, las revoca y refresca last_seen_at).
-- SELECT a secas no basta. `n8n` es el rol con el que se conecta el backend
-- (DB_USER); ajustar si cambia.
GRANT SELECT, INSERT, UPDATE ON audit_portal.user_sessions TO n8n;

-- ─── Notas de despliegue ─────────────────────────────────────
--
-- Este script es idempotente y se puede reejecutar sin efecto.
--
-- Al desplegar, TODOS los usuarios con sesión abierta tendrán que volver a
-- entrar una sola vez: sus tokens se emitieron sin `sid` y requireAuth los
-- rechaza. Es intencional —un token sin sesión asociada no es verificable— y
-- por eso conviene aplicarlo en horario de baja actividad.
