const { rateLimit, ipKeyGenerator } = require("express-rate-limit");
const crypto = require("crypto");

const loginLimiter = rateLimit({
    windowMs: 15*60*1000,
    max:5,
    keyGenerator: (req) => String(req.body?.username || '').trim().toLowerCase() || 'unknown-user',
    skipSuccessfulRequests: true,
    requestWasSuccessful: (req, res) => res.statusCode !== 401,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: "Demasiados intentos de inicio de sesion, intente nuevamente en 15 minutos",
    },
});

const revaluationActionLimiter = rateLimit({
    windowMs: 5*60*1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: "Demasiadas solicitudes de aprobacion/rechazo, intente nuevamente en unos minutos",
    },
});

const adminActionLimiter = rateLimit({
    windowMs: 5*60*1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: "Demasiadas operaciones de administracion, intente nuevamente en unos minutos",
    },
});

const n8nNotifyLimiter = rateLimit({
    windowMs: 60*1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: "Demasiadas notificaciones recibidas, intente nuevamente en un minuto",
    },
});

// Escrituras del operador dentro del portal: emitir, revocar, regenerar y
// reactivar enlaces, y marcar un embarque como revisado. Va por IP como el
// resto de limiters internos, porque detras hay una sesion identificada.
const internationalPurchasesActionLimiter = rateLimit({
    windowMs: 5*60*1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: "Demasiadas operaciones de compras internacionales, intente nuevamente en unos minutos",
    },
});

// Registro externo de embarques. NO se puede keyear por IP como los demas: los
// forwarders son empresas y varios empleados pueden salir por la misma IP
// publica, asi que uno activo agotaria la cuota de los demas. Se keyea por el
// enlace, que es justo la unidad que se quiere acotar.
//
// La clave es el SHA-256 del token, no el token: la libreria guarda las claves
// en memoria y algunos `store` las persisten. Un enlace de escritura no tiene
// por que acabar en el almacen del limiter en claro.
//
// Sin token se cae a la IP —normalizada con ipKeyGenerator, obligatorio desde
// la v7 para que un /64 de IPv6 no se salte la cuota cambiando de sufijo—, de
// modo que quien golpee el endpoint sin credencial tambien tenga tope.
function inviteTokenKey(req) {
    const token = req.get("X-Shipment-Invite-Token");

    if (token && token.trim()) {
        return `invite:${crypto.createHash("sha256").update(token.trim()).digest("hex")}`;
    }

    return `ip:${ipKeyGenerator(req.ip)}`;
}

const forwarderPublicLimiter = rateLimit({
    windowMs: 60*1000,
    max: 30,
    keyGenerator: inviteTokenKey,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: "Demasiadas solicitudes desde este enlace, intente nuevamente en un minuto",
    },
});

// El alta de embarque es mas cara —escribe, avisa a n8n— y no hay motivo para
// registrar 30 embarques en un minuto. Se aplica ADEMAS del anterior.
const forwarderSubmitLimiter = rateLimit({
    windowMs: 60*60*1000,
    max: 60,
    keyGenerator: inviteTokenKey,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: "Se alcanzo el limite de embarques registrados por hora desde este enlace, intente nuevamente mas tarde",
    },
});

module.exports = {
    loginLimiter,
    revaluationActionLimiter,
    adminActionLimiter,
    n8nNotifyLimiter,
    internationalPurchasesActionLimiter,
    forwarderPublicLimiter,
    forwarderSubmitLimiter,
};
