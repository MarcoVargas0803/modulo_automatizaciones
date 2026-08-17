Conviven **cuatro** mecanismos. Tres de ellos no usan la cookie de sesión, así que antes de
proteger una ruta nueva hay que saber cuál toca.

| Credencial                | Dónde viaja                              | Secreto                  | Notas                                                                                    |
| ------------------------- | ---------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------- |
| **Sesión**                | Cookie `httpOnly`, `sameSite: lax`       | `JWT_SECRET`             | Audiencia `modulo-reportes-session`, 8 h. **Sin `maxAge`**: muere al cerrar el navegador |
| **CSRF**                  | Cookie legible + header `X-CSRF-Token`   | aleatorio 32 B           | Doble envío, comparado con `timingSafeEqual`                                             |
| **Invitación a forwarder**| Fragmento de la URL → header `X-Shipment-Invite-Token` | aleatorio 32 B, guardado **hasheado** | Quien la usa no tiene cuenta. Solo abre las 3 rutas de `-public`. `findUsableInvite` devuelve motivos **opacos** a propósito |
| **Webhook n8n**           | Header configurable                      | `N8N_WEBHOOK_AUTH_TOKEN` | Sin token configurado responde 503, no deja pasar                                        |

`requireAuth` verifica la firma, valida la forma de `userId` con `/^\d+$/` **sin convertirlo**
(un `BIGINT` llega como string desde `pg`) y comprueba contra la base, con un **cache en memoria
de 60 segundos**, dos cosas en una sola consulta: que el usuario siga activo y que **la sesión del
`sid` del token siga viva**.

### Sesión de servidor (`audit_portal.user_sessions`)

El JWT ya no es la sesión: lleva un `sid` que apunta a una fila revocable. Es lo que permite
expulsar a un dispositivo de verdad —revocar la fila invalida el token en el acto— y lo que hace
que el logout deje de ser cosmético. El razonamiento completo está en
`scripts/schema-auth-sessions.sql`; el ciclo de vida, en `shared/services/session.service.js`.

**Dos predicados distintos, y confundirlos es una regresión:**

| Predicado    | Quién lo usa | Regla                                              |
| ------------ | ------------ | -------------------------------------------------- |
| **Validez**  | `requireAuth` | `revoked_at IS NULL AND expires_at > now()`. La inactividad **no** invalida |
| **Bloqueo**  | el login      | lo anterior **+** `last_seen_at` en los últimos 15 min |

Una sesión ociosa sigue siendo válida (quien lleva un rato leyendo un reporte no debe ser
expulsado) pero **no bloquea** un login nuevo: entra y la revoca. Esa asimetría es lo que impide
que cerrar el navegador sin hacer logout deje al usuario fuera de su propia cuenta.

Un 401 por sesión revocada lleva `code: 'SESSION_REVOKED'`, que el frontend distingue del 401
genérico de caducidad. Los cuatro motivos de revocación son `logout`, `replaced`, `admin` y
`user_deactivated`.

`requireProcess(codigo, { role, requireExport })` cruza `user_process_access` con `users` y
`processes` exigiendo que las tres estén activas, y deja el resultado en `req.processAccess`.

### Cadenas de middlewares canónicas

| Operación         | Cadena                                                                            |
| ----------------- | --------------------------------------------------------------------------------- |
| Lectura           | `requireAuth, requireXAccess`                                                     |
| Escritura         | `requireAuth, requireXAccess, requireCsrf, <modulo>ActionLimiter`                 |
| Webhook entrante  | `requireN8nToken, n8nNotifyLimiter` (sin sesión ni CSRF)                          |
| Ruta pública      | `forwarderPublicLimiter` o `forwarderSubmitLimiter` + validación del token de invitación **dentro del handler** |

**Ninguna ruta acepta archivos.** No hay `multer` en las dependencias: si vuelve un módulo que
suba archivos, hay que reinstalarlo, colocar su middleware **al final de la cadena de escritura**
(justo antes del handler) y devolver el bloque `/uploads` a `app.js` y su proxy a `vite.config.js`.

`admin.routes.js:35-36` formaliza la cadena con arrays `guard` / `writeGuard` expandidos con
spread; `international-purchases.routes.js` hace lo mismo. **Es el patrón a seguir en módulos
nuevos.**

### Rate limiters (`shared/middlewares/rate-limit.middleware.js`)

| Limiter                                | Cuota       | Clave                                  |
| -------------------------------------- | ----------- | -------------------------------------- |
| `loginLimiter`                         | 5 / 15 min  | **username**, y no cuenta los aciertos |
| `revaluationActionLimiter`             | 30 / 5 min  | IP                                     |
| `internationalPurchasesActionLimiter`  | 30 / 5 min  | IP                                     |
| `adminActionLimiter`                   | 30 / 5 min  | IP                                     |
| `n8nNotifyLimiter`                     | 60 / 1 min  | IP                                     |
| `forwarderPublicLimiter`               | 30 / 1 min  | **token de invitación**                |
| `forwarderSubmitLimiter`               | 60 / 1 hora | **token de invitación**                |

Los dos del forwarder se acotan por token y no por IP a propósito: varios forwarders pueden salir
por la misma IP corporativa, y castigar a uno por el ritmo de otro es un fallo de disponibilidad.

---
