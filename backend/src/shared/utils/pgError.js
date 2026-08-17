// Clasifica errores de PostgreSQL que son culpa de la peticion, no del servidor.
//
// El problema que resuelve: un UPDATE que choca contra un UNIQUE lanza un error
// con code 23505. Si el router lo deja caer al catch generico sale como 500, y
// globalErrorHandler oculta el mensaje en los 5xx a proposito -- el usuario ve
// "Error interno del servidor" cuando lo que paso es que la referencia ya existe.
//
// La correccion NO es destapar los 5xx (esa ocultacion es deliberada y correcta),
// sino que estos errores nunca lleguen a serlo.

const PG_ERROR_MAP = {
  // Violacion de restriccion unica. El caso que motivo este helper:
  // international_purchases.shipments.tracking_key.
  23505: { status: 409, fallback: "Ya existe un registro con ese valor" },
  // Violacion de clave foranea: se referencia algo que no existe, o se intenta
  // borrar algo de lo que otra fila depende.
  23503: { status: 409, fallback: "El registro esta referenciado por otros datos" },
  // NOT NULL violado: falto un campo obligatorio.
  23502: { status: 400, fallback: "Falta un campo obligatorio" },
  // Texto invalido para el tipo de la columna (un UUID mal formado, por ejemplo).
  "22P02": { status: 400, fallback: "Alguno de los datos enviados tiene un formato invalido" },
};

/**
 * Traduce un error de `pg` a una respuesta HTTP si es un fallo atribuible a la
 * peticion. Devuelve `null` cuando el error no esta mapeado, para que el
 * llamador siga con su manejo de 500 de siempre.
 *
 * @param {Error & {code?: string}} error Error tal cual lo lanza `pg`.
 * @param {Object<string, string>} [messages] Mensajes por codigo, para decir algo
 *   util del dominio en vez del texto generico. Ej. `{ 23505: "Ese BL ya esta
 *   registrado" }`.
 * @returns {{status: number, body: {success: false, message: string}}|null}
 *
 * @example
 * const mapped = mapPgError(error, { 23505: "Ya existe un embarque con esa referencia" });
 * if (mapped) return res.status(mapped.status).json(mapped.body);
 * return res.status(500).json(buildErrorResponse("Error al actualizar", error));
 */
function mapPgError(error, messages = {}) {
  const code = error?.code;
  if (!code) return null;

  const mapped = PG_ERROR_MAP[code];
  if (!mapped) return null;

  return {
    status: mapped.status,
    body: {
      success: false,
      message: messages[code] || mapped.fallback,
    },
  };
}

module.exports = {
  mapPgError,
  PG_ERROR_MAP,
};
