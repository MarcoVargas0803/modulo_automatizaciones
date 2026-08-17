const crypto = require("crypto");
const env = require("../config/env");

function createCsrfToken() {
  return crypto.randomBytes(32).toString("hex");
}

// Sin maxAge, igual que la cookie de sesion: si el token CSRF sobreviviera al cierre
// del navegador quedaria desparejado con una sesion que ya no existe.
function getCsrfCookieOptions() {
  return {
    httpOnly: false,
    path: "/",
    sameSite: "lax",
    secure: env.auth.cookieSecure,
  };
}

function getCsrfClearCookieOptions() {
  return {
    httpOnly: false,
    path: "/",
    sameSite: "lax",
    secure: env.auth.cookieSecure,
  };
}

function setCsrfCookie(res, token = createCsrfToken()) {
  res.cookie(env.auth.csrfCookieName, token, getCsrfCookieOptions());
  return token;
}

function ensureCsrfCookie(req, res) {
  if (!req.cookies[env.auth.csrfCookieName]) {
    setCsrfCookie(res);
  }
}

function clearCsrfCookie(res) {
  res.clearCookie(env.auth.csrfCookieName, getCsrfClearCookieOptions());
}

function safeCompare(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return (
    leftBuffer.length === rightBuffer.length &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function requireCsrf(req, res, next) {
  const cookieToken = req.cookies[env.auth.csrfCookieName];
  const headerToken = req.get("X-CSRF-Token");

  if (!cookieToken || !headerToken || !safeCompare(cookieToken, headerToken)) {
    return res.status(403).json({
      success: false,
      message: "Token CSRF invalido o ausente",
    });
  }

  return next();
}

module.exports = {
  clearCsrfCookie,
  ensureCsrfCookie,
  requireCsrf,
  safeCompare,
  setCsrfCookie,
};
