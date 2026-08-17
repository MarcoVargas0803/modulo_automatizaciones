// Emision y verificacion de los enlaces permanentes que se entregan a los
// forwarders para que registren embarques sin cuenta en el sistema.

const crypto = require("crypto");
const pool = require("../../../shared/db/pool");

// 32 bytes = 256 bits de entropia. En base64url son 43 caracteres sin relleno,
// sin '+', '/' ni '=' que obliguen a escapar nada al viajar en una URL.
const TOKEN_BYTES = 32;

// Longitud del hash en hexadecimal. Se usa para descartar basura antes de tocar
// la base: un token que no produce 64 caracteres hex no puede existir en ella.
const TOKEN_HASH_LENGTH = 64;

function generateToken() {
  return crypto.randomBytes(TOKEN_BYTES).toString("base64url");
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

// Comparacion en tiempo constante. timingSafeEqual LANZA si los buffers miden
// distinto, asi que la longitud se comprueba antes: es informacion publica
// —todos los hashes miden lo mismo— y no filtra nada.
function safeHashEquals(a, b) {
  const bufferA = Buffer.from(String(a), "utf8");
  const bufferB = Buffer.from(String(b), "utf8");

  if (bufferA.length !== bufferB.length) return false;

  return crypto.timingSafeEqual(bufferA, bufferB);
}

/**
 * Resuelve un token en claro contra la tabla de enlaces y decide si sirve.
 *
 * La latencia perezosa vive aqui: el backend NO tiene planificador de tareas
 * (verificado; no hay cron ni scheduler en todo el proyecto) y no se va a
 * introducir uno solo para esto. En vez de un trabajo nocturno que marque
 * enlaces dormidos, la inactividad se evalua en el momento en que alguien
 * presenta el token, que es el unico momento en que la respuesta importa.
 *
 * Devuelve siempre { invite, reason }:
 *   reason === null            -> el enlace sirve, `invite` trae la fila
 *   'NOT_FOUND'                -> el token no corresponde a ningun enlace
 *   'REVOKED' | 'DORMANT'      -> existe pero esta fuera de servicio
 *   'EXPIRED'                  -> tenia expires_at y ya paso
 *
 * El llamador decide que contar al cliente. Recomendado: no distinguir
 * NOT_FOUND de REVOKED de cara al forwarder, para no confirmar que un token
 * existio; los otros dos si merecen mensaje propio porque son recuperables.
 *
 * @param {string} token Token en claro tal como llega del cliente.
 * @param {object} [options]
 * @param {object} [options.client] Cliente de pg dentro de una transaccion. Si
 *   no se pasa, usa el pool. Necesario para el alta de embarque, que resuelve
 *   el enlace y lo incrementa en la misma transaccion.
 * @returns {Promise<{invite: object|null, reason: string|null}>}
 */
async function findUsableInvite(token, { client } = {}) {
  const executor = client || pool;
  const cleanToken = typeof token === "string" ? token.trim() : "";

  if (!cleanToken) {
    return { invite: null, reason: "NOT_FOUND" };
  }

  const tokenHash = hashToken(cleanToken);

  if (tokenHash.length !== TOKEN_HASH_LENGTH) {
    return { invite: null, reason: "NOT_FOUND" };
  }

  // Se consulta por igualdad de hash —es lo que permite usar el indice— y
  // ADEMAS se compara en tiempo constante sobre el resultado. La primera
  // comparacion la hace Postgres y no es de tiempo constante, pero opera sobre
  // el hash, no sobre el secreto: un atacante que midiera esa diferencia
  // aprenderia como se distribuyen los hashes, no el token.
  const result = await executor.query(
    `
      SELECT
        invite_id,
        token_hash,
        forwarder_name,
        recipient_email,
        status,
        expires_at,
        dormant_after_days,
        submission_count,
        last_used_at,
        created_at
      FROM international_purchases.registration_invites
      WHERE token_hash = $1
      LIMIT 1;
    `,
    [tokenHash],
  );

  const invite = result.rows[0];

  if (!invite || !safeHashEquals(invite.token_hash, tokenHash)) {
    return { invite: null, reason: "NOT_FOUND" };
  }

  if (invite.status === "REVOKED") {
    return { invite, reason: "REVOKED" };
  }

  if (invite.expires_at && new Date(invite.expires_at) <= new Date()) {
    return { invite, reason: "EXPIRED" };
  }

  if (invite.status === "DORMANT") {
    return { invite, reason: "DORMANT" };
  }

  // Latencia perezosa. La referencia es el ultimo uso; si nunca se uso, la
  // fecha de emision. Un enlace emitido y jamas usado tambien envejece: si
  // nadie lo abrio en 18 meses, lo mas probable es que se perdiera el correo.
  if (invite.dormant_after_days !== null) {
    const reference = invite.last_used_at || invite.created_at;
    const idleMs = Date.now() - new Date(reference).getTime();
    const limitMs = invite.dormant_after_days * 24 * 60 * 60 * 1000;

    if (idleMs > limitMs) {
      // Se persiste el cambio para que el inventario del operador lo muestre
      // sin tener que recalcularlo. Si el UPDATE falla, la peticion se rechaza
      // igual: la decision ya esta tomada arriba y no depende de que se guarde.
      await executor.query(
        `
          UPDATE international_purchases.registration_invites
             SET status = 'DORMANT'
           WHERE invite_id = $1
             AND status = 'ACTIVE';
        `,
        [invite.invite_id],
      );

      return { invite: { ...invite, status: "DORMANT" }, reason: "DORMANT" };
    }
  }

  return { invite, reason: null };
}

// Motivos que NO se distinguen de cara al forwarder: confirmar que un token
// existio pero fue revocado es informacion que no le sirve y a un atacante si.
const OPAQUE_REASONS = new Set(["NOT_FOUND", "REVOKED"]);

const REASON_MESSAGES = {
  NOT_FOUND: "El enlace no es valido. Solicite uno nuevo a su contacto en Maderas Rivero.",
  REVOKED: "El enlace no es valido. Solicite uno nuevo a su contacto en Maderas Rivero.",
  EXPIRED: "El enlace expiro. Solicite uno nuevo a su contacto en Maderas Rivero.",
  DORMANT:
    "El enlace lleva mucho tiempo sin usarse y quedo inactivo. Avise a su contacto en Maderas Rivero para reactivarlo.",
};

function messageForReason(reason) {
  return REASON_MESSAGES[reason] || REASON_MESSAGES.NOT_FOUND;
}

module.exports = {
  TOKEN_BYTES,
  OPAQUE_REASONS,
  generateToken,
  hashToken,
  safeHashEquals,
  findUsableInvite,
  messageForReason,
};
