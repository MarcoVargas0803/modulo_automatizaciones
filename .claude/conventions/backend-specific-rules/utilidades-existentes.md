### Utilidades existentes (leer antes de escribir un helper)

Esta es la sección que evita duplicar código. Todo en `backend/src/`. Lo de `shared/` es de uso general; lo de `modules/<m>/utils/` es privado de ese módulo (ver `.claude/conventions/architecture.md`).

| Módulo                                               | Qué da                                                                         | Cuándo usarlo                                                                                                    |
| ---------------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `shared/utils/errorResponse.js`                      | `buildErrorResponse(msg, error)`                                               | **Todos** los `catch`. Añade `error.message` solo fuera de producción                                            |
| `shared/utils/pgError.js`                            | `mapPgError(error, messages?)`                                                 | Antes de `buildErrorResponse` en un `catch` que envuelva un `INSERT`/`UPDATE`/`DELETE`. Convierte `23505`/`23503`/`23502`/`22P02` en 409/400; devuelve `null` si el error no es de la petición |
| `modules/executions/utils/pagination.js`             | `getPagination(query)`, `getPaginationMetadata()`                              | Cualquier listado. Fija `limit` entre 1 y 100 y calcula `hasNextPage`                                            |
| `modules/executions/utils/validateExecutionQuery.js` | Middleware de validación                                                       | Filtros de ejecuciones: whitelist de estados, fechas reales de calendario, búsqueda ≤ 100 chars                  |
| `modules/executions/utils/executionFilters.js`       | `buildExecutionFilters(query, values)`                                         | Construye el `WHERE` de ejecuciones acumulando los `$n`                                                          |
| `modules/executions/utils/accessControl.js`          | `accessControlJoins(alias)`, `accessControlConditions(param, {requireExport})` | Filtrar un listado por los procesos del usuario **dentro del SQL**                                               |
| `shared/utils/csv.js`                                | `rowsToCsv(rows)`, `escapeCsvValue(value)`                                     | Cualquier exportación CSV. **Mitiga CSV injection** prefijando `'` a lo que empiece por `= + - @`                |
| `shared/utils/activityLog.js`                        | `logActivity(req, {action, entityType, entityId, detail})`                     | Auditoría funcional. Acciones con formato `modulo.verbo`. **Nunca lanza**: un fallo de log no tumba la operación |
| `shared/utils/toNumber.js`                           | `toNumber(value, fallback)`                                                    | Convertir un valor de entrada a número con valor por defecto                                                     |
| `shared/utils/parsePositiveInt.js`                   | `parsePositiveInt(value)`                                                      | Validar un `:id` de la URL. **Ya existe**: no volver a escribir `Number.parseInt` + `> 0` con otro nombre        |
| `shared/db/pool.js`                                  | Pool de `pg` singleton                                                         | Toda consulta. Para transacciones, `pool.connect()` + `BEGIN`/`COMMIT`/`ROLLBACK`                                |
| `shared/config/env.js`                               | Objeto `env` validado                                                          | Toda variable de entorno                                                                                         |
| `shared/services/session.service.js`                 | `createSession`, `findBlockingSession`, `revokeSessionById`, `revokeUserSessions`, `invalidateUserCache` | Ciclo de vida de la sesión de servidor. Lo usan `auth` y `admin`                          |
| `shared/services/n8n.service.js`                     | `postWebhook` + 3 triggers (`InternationalPurchasesTracking`, `MaterialRevaluationSend`, `ForwarderInvite`) | Cualquier llamada a n8n. Ya trae timeout, headers y recorte de la respuesta en producción |

> **Ojo con `modules/executions/utils/`.** Los cuatro helpers de arriba son privados de
> `executions` por la regla de decisión (un solo consumidor), pero `pagination.js` y
> `accessControl.js` son genéricos. El día que un segundo módulo los necesite, **suben a
> `shared/utils/`** — no se copian ni se importan cruzando módulos, que rompería
> `dependency-rules.md`.

---
