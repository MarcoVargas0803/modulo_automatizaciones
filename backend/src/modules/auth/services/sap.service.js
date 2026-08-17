const https = require("https");

const env = require("../../../shared/config/env");

function sapRequest(pathName, { method = "POST", body, cookie } = {}) {
  return new Promise((resolve, reject) => {
    const base = env.sap.serviceLayerUrl.replace(/\/$/, "");
    const url = new URL(`${base}/${pathName}`);
    const payload = body ? JSON.stringify(body) : null;

    const headers = { "Content-Type": "application/json" };
    if (payload) {
      headers["Content-Length"] = Buffer.byteLength(payload);
    }
    if (cookie) {
      headers.Cookie = cookie;
    }

    const request = https.request(
      url,
      {
        method,
        rejectUnauthorized: false,
        headers,
        timeout: env.sap.loginTimeoutMs,
      },
      (response) => {
        let data = "";
        response.on("data", (chunk) => {
          data += chunk;
        });
        response.on("end", () => {
          resolve({
            status: response.statusCode,
            headers: response.headers,
            body: data,
          });
        });
      },
    );

    request.on("timeout", () => request.destroy(new Error("timeout")));
    request.on("error", reject);
    if (payload) {
      request.write(payload);
    }
    request.end();
  });
}

// Cierra la sesion de SAP recien abierta. Best-effort: si falla, la sesion muere
// sola por timeout del Service Layer; no debe afectar al resultado del login.
async function logoutSap(setCookieHeaders) {
  if (!Array.isArray(setCookieHeaders) || setCookieHeaders.length === 0) {
    return;
  }
  const cookie = setCookieHeaders.map((c) => c.split(";")[0]).join("; ");
  try {
    await sapRequest("Logout", { cookie });
  } catch {
    // Ignorado a proposito.
  }
}

// Devuelve { ok, configured }. ok=true solo si SAP acepto las credenciales.
// configured=false cuando faltan SAP_SERVICE_LAYER_URL/SAP_COMPANY_DB: el login
// lo distingue para dar un mensaje de "no disponible" en vez de "credenciales".
async function verifySapCredentials(username, password) {
  if (!env.sap.serviceLayerUrl || !env.sap.companyDb) {
    return { ok: false, configured: false };
  }

  let response;
  try {
    response = await sapRequest("Login", {
      body: {
        CompanyDB: env.sap.companyDb,
        UserName: username,
        Password: password,
      },
    });
  } catch (error) {
    return { ok: false, configured: true, reachable: false, message: error.message };
  }

  if (response.status === 200) {
    await logoutSap(response.headers["set-cookie"]);
    return { ok: true, configured: true, reachable: true };
  }

  // 401 = credenciales invalidas. Cualquier otro status (400 CompanyDB, 5xx) se
  // trata igual de cara al usuario, pero se marca para diferenciarlo en el log.
  return {
    ok: false,
    configured: true,
    reachable: true,
    status: response.status,
  };
}

module.exports = { verifySapCredentials };
