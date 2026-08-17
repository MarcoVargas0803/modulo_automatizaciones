require("dotenv").config();

const requiredEnvVars = [
  "DB_HOST",
  "DB_PORT",
  "DB_NAME",
  "DB_USER",
  "DB_PASSWORD",
  "JWT_SECRET",
  "FRONTEND_ORIGINS",
];

const missingEnvVars = requiredEnvVars.filter((envVar) => {
  return !process.env[envVar];
});

if (missingEnvVars.length > 0) {
  throw new Error(
    `Faltan variables de entorno requeridas: ${missingEnvVars.join(", ")}`,
  );
}

// Parseo estricto de enteros de configuracion: una variable presente pero invalida
// (no numerica o fuera de rango) falla al arrancar en vez de degradar en silencio.
// Ausente o vacia usa el default.
function parseIntEnv(name, defaultValue, { min = 0 } = {}) {
  const raw = process.env[name];

  if (raw === undefined || raw === "") {
    return defaultValue;
  }

  const value = Number(raw);

  if (!Number.isInteger(value) || value < min) {
    throw new Error(
      `Variable de entorno invalida: ${name}=${raw}. Debe ser un entero >= ${min}.`,
    );
  }

  return value;
}

// SSL del pool es opt-in. Si se habilita, EXIGE una CA: nunca se acepta una
// conexion TLS sin validar el certificado (jamas rejectUnauthorized:false).
const dbSslEnabled = process.env.DB_SSL_ENABLED === "true";
const dbSslCa = process.env.DB_SSL_CA || null;

if (dbSslEnabled && !dbSslCa) {
  throw new Error(
    "DB_SSL_ENABLED=true requiere DB_SSL_CA (certificado de la CA). No se acepta " +
      "una conexion SSL a PostgreSQL sin validar el certificado.",
  );
}

const env = {
  port: process.env.PORT || 3001,

  nodeEnv: process.env.NODE_ENV || "production",
  frontendOrigins: process.env.FRONTEND_ORIGINS.split(",").map((origin) => origin.trim()),

  db: {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    name: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,

    pool: {
      max: parseIntEnv("DB_POOL_MAX", 10, { min: 1 }),
      connectionTimeoutMs: parseIntEnv("DB_CONNECTION_TIMEOUT_MS", 5000),
      idleTimeoutMs: parseIntEnv("DB_IDLE_TIMEOUT_MS", 10000),
      statementTimeoutMs: parseIntEnv("DB_STATEMENT_TIMEOUT_MS", 30000),
      queryTimeoutMs: parseIntEnv("DB_QUERY_TIMEOUT_MS", 0),
    },

    // Opt-in. La validacion de que exista CA cuando enabled=true se hace arriba.
    ssl: {
      enabled: dbSslEnabled,
      ca: dbSslCa,
    },
  },

  auth: {
    jwtSecret: process.env.JWT_SECRET,
    jwtAudience: "modulo-reportes-session",
    jwtIssuer: "modulo-reportes",
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || "8h",
    cookieName: process.env.COOKIE_NAME || "modulo_reportes_token",
    csrfCookieName: process.env.CSRF_COOKIE_NAME || "modulo_reportes_csrf",
    cookieSecure: process.env.COOKIE_SECURE === "true",
  },

  n8n: {
    internationalPurchasesWebhookUrl:
      process.env.N8N_INTERNATIONAL_PURCHASES_WEBHOOK_URL || null,
    materialRevaluationWebhookUrl:
      process.env.N8N_MATERIAL_REVALUATION_WEBHOOK_URL || null,
    forwarderInviteWebhookUrl:
      process.env.N8N_FORWARDER_INVITE_WEBHOOK_URL || null,
    webhookTimeoutMs: Number(process.env.N8N_WEBHOOK_TIMEOUT_MS || 10000),
    webhookAuthHeader: process.env.N8N_WEBHOOK_AUTH_HEADER || "X-Webhook-Token",
    webhookAuthToken: process.env.N8N_WEBHOOK_AUTH_TOKEN || null,
  },

  internationalPurchases: {
    
    registrationBaseUrl:
      process.env.INTERNATIONAL_PURCHASES_REGISTRATION_BASE_URL ||
      process.env.FRONTEND_ORIGINS.split(",")[0].trim(),
    registrationPath: "/compras/registro-embarque",
  },

  sinay: {
    apiKey: process.env.SINAY_API_KEY || null,
  },

  sap: {
    serviceLayerUrl: process.env.SAP_SERVICE_LAYER_URL || null,
    companyDb: process.env.SAP_COMPANY_DB || null,
    loginTimeoutMs: Number(process.env.SAP_LOGIN_TIMEOUT_MS || 10000),
  },
};

module.exports = env;
