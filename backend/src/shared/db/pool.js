const { Pool } = require('pg');
const env = require('../config/env');

const poolConfig = {
    host: env.db.host,
    port: env.db.port,
    database: env.db.name,
    user: env.db.user,
    password: env.db.password,

    max: env.db.pool.max,
    connectionTimeoutMillis: env.db.pool.connectionTimeoutMs,
    idleTimeoutMillis: env.db.pool.idleTimeoutMs,
    // statement_timeout lo aplica el servidor: cancela la sentencia y libera la
    // conexion, evitando que una query colgada retenga un slot del pool.
    statement_timeout: env.db.pool.statementTimeoutMs,

    // SSL opt-in y siempre con validacion de certificado (ver env.js). Sin SSL, pg
    // acepta `false` como "sin TLS".
    ssl: env.db.ssl.enabled
        ? { ca: env.db.ssl.ca, rejectUnauthorized: true }
        : false,
};

// query_timeout (lado cliente) esta desactivado por default (0). Solo se pasa a pg
// cuando es > 0, para no fijar un corte de cliente que no se pidio en esta fase.
if (env.db.pool.queryTimeoutMs > 0) {
    poolConfig.query_timeout = env.db.pool.queryTimeoutMs;
}

const pool = new Pool(poolConfig);

// Un cliente idle puede emitir 'error' si el servidor cierra la conexion (reinicio
// de PostgreSQL, corte de red). Sin este handler, pg lo propaga como excepcion no
// capturada que tumba el proceso. Se registra solo el mensaje: no se vuelca la
// config del pool ni el connection string, para no filtrar credenciales.
pool.on('error', (error) => {
    console.error('[db pool] error en cliente idle de PostgreSQL:', error.message);
});

module.exports = pool;
