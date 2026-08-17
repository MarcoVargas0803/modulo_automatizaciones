# Pendientes de coordinación — Compras Internacionales

Cosas que **no se pueden verificar ni resolver desde este repositorio** porque
dependen de terceros (el workflow de n8n, la base de datos de producción, el
despliegue). Cada una indica qué bloquea y quién debe responder.

Documento vivo: al cerrar un punto, marcarlo como resuelto con fecha y con lo que se
acordó, en vez de borrarlo. El historial de por qué se decidió algo vale más que la
lista corta.

**Contexto:** proyecto de registro de embarques por forwarder mediante enlace
permanente. El plan completo está fuera del repositorio; este archivo solo recoge sus
dependencias externas.

---

## 1. n8n · Corrección de `tracking_key` — **RESUELTO (05/08/2026): no bloquea**

Se revisó `Flujo_principal_tracking.json` (copia versionada en
[`workflows/`](workflows/Flujo_principal_tracking.json)).

**El workflow no guarda ningún estado por `tracking_key`.** Es un sondeo completo:

```
Schedule (9:00) ─┐
                 ├─→ Set Request_ID → SELECT * FROM v_active_shipments_for_tracking
Webhook ─────────┘                    → SafeCube GET ?shipmentNumber={{tracking_key}}&sealine={{scac}}
                                      → UPDATE ... WHERE shipment_id = $9
```

Relee la clave de la vista en cada corrida y actualiza por `shipment_id`. **Cambiar
`tracking_key` no exige ningún cambio en n8n:** la siguiente pasada consulta la clave
nueva y la vieja no se vuelve a consultar nunca, porque nada la persiste. Tampoco hay
consultas encoladas: la llamada a SafeCube es síncrona dentro de la corrida.

En consecuencia **la Fase 1 deja de estar bloqueada**, y el disparador
`shipment_key_corrected` que se había propuesto con `previousTrackingKey` sobra: no hay
a quién avisar de la clave vieja.

Sigue abierto lo del historial, que es decisión del portal, no de n8n:
`shipment_tracking_history` guarda `tracking_key` por fila, así que tras corregir la
clave las filas viejas quedan con la anterior. La propuesta del plan es purgarlas al
cambiar la clave.

**Estado:** resuelto. No hace falta ningún cambio en n8n para la Fase 1.

---

## 2. n8n · Columna `bl`

**Bloquea:** Paso B de la retirada de `bl` (eliminar la columna de la base). **No
bloquea el Paso A**, que solo deja de leerla y escribirla desde el portal.

**El problema.** `international_purchases.shipments.bl` es una columna espejo de
`tracking_key`, derivada con `CASE WHEN tracking_reference_type = 'BL' THEN
tracking_key ELSE NULL END`. En el portal **no tiene ningún consumidor en el frontend**
y ya no se lee desde el backend (Paso A, Fase 0).

**Verificado por MCP (05/08/2026): la columna está muerta desde el portal.** El
`CHECK shipments_tracking_reference_type_check` obliga a que
`tracking_reference_type` sea exactamente `'MBL'`, así que la rama `= 'BL'` del `CASE`
**nunca se cumple** y todo embarque nuevo nace con `bl = NULL`. De 13 filas, solo 3 la
tienen —todas del 18–22/07/2026, anteriores al `CHECK` actual— y en las 3
`bl = tracking_key` exactamente. El portal sigue escribiéndola por prudencia, pero
escribe `NULL` el 100% de las veces.

**Verificado también el lado de n8n (05/08/2026), sobre el JSON del workflow: no la
usa.** El `SELECT *` la trae, pero ningún nodo la consume —`Calculate ETA and Dates`
solo lee `eta/etd/atd/ata/shipment_status/shipment_id`, y la llamada a SafeCube usa
`tracking_key` + `scac`— y el `UPDATE` no la escribe.

**Corrección al plan:** la referencian **tres** vistas, no dos. Faltaba
`international_purchases.v_active_shipments_for_tracking`, que es justo la que lee n8n
y hace `COALESCE(bl, tracking_key) AS bl`. Como `bl` es siempre `NULL`, ese `COALESCE`
ya devuelve `tracking_key`, así que quitarlo no cambia ningún resultado. El Bloque 4
del script recrea ahora las tres.

**Lo único que queda:**

- [ ] ¿Algún consumidor **fuera** del portal y de este workflow (reportes, Power BI,
      otro flujo de n8n) la usa? Si no, se puede ejecutar el Bloque 4.

**Responde:** responsable del workflow de n8n + quien administre la base.
**Estado:** pendiente.

---

## 3. n8n · Webhook de invitación al forwarder — **CONSTRUIDO Y PROBADO (06/08/2026)**

El flujo existe y está versionado en
[`workflows/Invitacion_registro_forwarder.json`](workflows/Invitacion_registro_forwarder.json).
Construido y probado en el n8n local; **falta importarlo en producción.**

```
Webhook POST /webhook/international-purchases/forwarder-invite
  → Validar y Componer Correo (Code)
  → ¿Invitación válida?
       sí → Enviar Invitación (SMTP) → Responder Enviado           200
                    └─ error SMTP  → Responder Fallo de Envío      502
       no →                          Responder Datos Inválidos     400
```

### Contrato

**Entrada** (lo que mandará `triggerForwarderInvite()`):

```json
{
  "trigger": "forwarder_invite_created",
  "source": "portal",
  "requestedAt": "2026-08-06T10:00:00.000Z",
  "forwarderName": "DHL Global Forwarding",
  "recipientEmail": "operaciones@ejemplo.com",
  "registrationUrl": "https://…/compras/registro-embarque#token=…",
  "issuedBy": { "userId": 1, "username": "operador" }
}
```

Acepta los campos tanto en `body` como en la raíz del item, para poder probarlo con
datos fijados sin pasar por HTTP.

**Salida**, pensada para que `parseNotificationConfirmation` distinga los tres casos —
que es justo lo que pedía este punto:

| Situación | HTTP | Cuerpo |
| --- | --- | --- |
| El correo salió | **200** | `{ success: true, notified: true }` |
| n8n lo recibió, SMTP falló | **502** | `{ success: false, notified: false, message: <error> }` |
| Payload inválido | **400** | `{ success: false, notified: false, message: <motivos> }` |

**Validaciones:** `forwarderName`, `recipientEmail` y `registrationUrl` obligatorios;
formato de correo; y `registrationUrl` debe ser `https` (se admite `localhost` y
`127.0.0.1` solo para pruebas). Los motivos se acumulan y se devuelven juntos.

### Pruebas ejecutadas con datos mock

| Caso | Resultado |
| --- | --- |
| Payload válido con URL `https` | → `Responder Enviado` |
| `recipientEmail` mal formado + URL `http` | → `Responder Datos Inválidos`, con **los dos** motivos |
| URL `http://localhost:5173` | → `Responder Enviado` (permitido en pruebas) |

`test_workflow` fija los nodos con credenciales, así que **no se envió ningún correo
real**. Queda sin probar el envío SMTP de verdad y la rama 502.

> **Bug encontrado y corregido durante las pruebas.** La validación usaba
> `new URL(registrationUrl)`, pero **el sandbox del nodo Code de n8n no expone el
> global `URL`**: lanzaba `ReferenceError`, el `catch` se lo tragaba y rechazaba URLs
> `https` perfectamente válidas. Se sustituyó por comprobación de prefijo. Es un
> recordatorio de que un `catch` amplio en un nodo Code puede ocultar un fallo real.

### Lo que falta

- [ ] **Conciliar el header de autenticación.** El webhook usa `headerAuth` y la
      credencial local exige el header **`api_key`**, pero el backend manda
      `N8N_WEBHOOK_AUTH_HEADER`, cuyo valor por omisión es `X-Webhook-Token`. **No
      coinciden.** Hay que igualarlos: o se cambia el nombre del header en la
      credencial de n8n, o se define `N8N_WEBHOOK_AUTH_HEADER=api_key` en el backend.
      Sin esto, producción devolverá 403.
      > La autenticación **no es opcional aquí**: sin ella, quien descubra la URL puede
      > hacer que el servidor mande correos arbitrarios a destinatarios arbitrarios —
      > un relay de spam con el dominio de la empresa.
- [ ] **Dar de alta la URL** como `N8N_INTERNATIONAL_PURCHASES_INVITE_WEBHOOK_URL` en
      `env.js` cuando se implemente el lado del portal.
- [ ] **Confirmar el remitente.** Se usó `agenteia@maderasrivero.com`, el mismo que ya
      emplea el flujo de revaluaciones.
- [ ] **Revisar la plantilla del correo** con quien corresponda: está en español, con
      la marca en `#421e04`, versión HTML y texto plano, y un aviso de que el enlace no
      debe reenviarse fuera del equipo de operaciones.

> **`registrationUrl` es un credencial de escritura.** El flujo **no la registra en
> ninguna base ni log** — por eso, a diferencia de los demás flujos del proyecto, no
> audita en `audit.workflow_events`: el portal ya lo hace con `logActivity`. Además el
> JSON versionado trae `saveDataSuccessExecution: "none"`, para que la URL no quede
> guardada en el historial de ejecuciones de n8n. **Conservar ese ajuste al importar.**

**Estado:** construido y probado en local. Pendiente de importar en producción y de
conciliar el header de autenticación.

---

## 4. Base de datos · `CHECK` sobre `source_type` — **RESUELTO (05/08/2026)**

Consultado por MCP contra la base de desarrollo. **El `CHECK` existe:**

```
shipments_source_type_check
  CHECK (source_type = ANY (ARRAY['EMAIL','PORTAL','N8N','MANUAL']))
```

El `ALTER` que suma `'FORWARDER'` conservando los cuatro valores ya está escrito en el
Bloque 3 de `backend/src/scripts/schema-international-purchases-invites.sql`.

> **Hallazgo colateral — divergencia real entre base y código.** El backend valida con
> `ALLOWED_SOURCE_TYPES = ["PORTAL", "N8N", "IMPORT", "SYSTEM"]`, que **no coincide**
> con la base: `'EMAIL'` y `'MANUAL'` son legales en la tabla —y `'EMAIL'` es además el
> `DEFAULT` de la columna— pero el filtro del listado los rechaza con 400; y
> `'IMPORT'`/`'SYSTEM'` pasan el filtro pero no pueden existir. Hoy no se nota porque
> las 13 filas son `'PORTAL'`. **Es un bug de código, no de base**, y se corrige aparte.

---

## 5. Base de datos · Vistas del listado — **RESUELTO (05/08/2026)**

Consultado por MCP. La cadena tiene **dos niveles**, no uno:

```
audit_portal.v_international_purchases_shipments_web   (solo agrega process_code)
  └─ international_purchases.v_shipments_portal        (deriva eta_status, days_to_eta,
       └─ international_purchases.shipments             primary_reference_*)
```

**Las columnas nuevas NO obligan a tocar las vistas.** El listado ya hace

```sql
FROM audit_portal.v_international_purchases_shipments_web v
JOIN international_purchases.shipments s ON s.shipment_id = v.shipment_id
```

así que `review_status`, `reviewed_by`, `reviewed_at` y `registered_by_invite_id` se
leen como `s.<columna>`, igual que ya se leen `supplier_name` e `invoice_code`, que
tampoco están en la vista. Solo el Paso B de `bl` exige recrearlas.

**Sigue pendiente, pero como deuda, no como bloqueo:**

- [ ] **Versionar ambas definiciones en el repositorio.** Es la misma deuda que dejó
      `payments.review_token_uses` sin DDL: si el entorno se recrea, nadie sabe cómo
      reconstruirlas. Las definiciones actuales están transcritas en el Bloque 4 del
      script.

---

## 6. Despliegue · Alcance del portal desde internet — **EL ÚNICO BLOQUEO REAL**

El formulario del forwarder es una ruta pública de la SPA
(`/compras/registro-embarque`) que **tiene que ser alcanzable desde fuera de la red de
la empresa**. Si no, el forwarder no puede abrirlo y nada del resto importa.

### La pregunta que diagnostica la situación

> **¿Cómo abre hoy el contador el enlace de `/pagos/revision`?**

Ese flujo ya envía por correo un enlace a una ruta pública de la SPA: el mismo
problema, ya resuelto o ya sorteado.

- **Desde fuera de la red** → el portal ya está expuesto. Solo hay que replicar la
  configuración para la ruta nueva. Es un ajuste, no un proyecto.
- **Desde dentro o por VPN** → no hay exposición. El contador es de la empresa y tiene
  VPN; **el forwarder no la tiene ni la va a instalar.** Caso nuevo.

### Ojo: VPN no es exposición

«Trabajamos con VPN por Cloudflare» puede ser una de dos cosas, y solo una sirve:

| Qué es | ¿Expone al público? | Cómo se reconoce |
| --- | --- | --- |
| **Cloudflare WARP / Zero Trust** | **No** | Se instala un cliente en el equipo para alcanzar recursos internos |
| **Cloudflare Tunnel (`cloudflared`)** | **Sí**, si tiene *public hostname* | Un demonio junto al servicio que lo publica en un dominio |

Con lo primero, el forwarder sigue fuera. Con lo segundo, falta poco.

### Si ya existe un Cloudflare Tunnel

Por omisión, lo publicado queda detrás de Cloudflare Access (login). Para que el
forwarder entre sin cuenta se crea una **aplicación de Access sobre la ruta concreta
con política de Bypass**. Las políticas *Bypass* se evalúan antes que las *Allow*
([documentación de Cloudflare](https://developers.cloudflare.com/cloudflare-one/policies/access/)),
así que conviven con la protección del resto del portal.

| Ruta | Política |
| --- | --- |
| `/compras/registro-embarque` | **Bypass** — pública |
| `/api/international-purchases/public/*` | **Bypass** — pública |
| Estáticos de la SPA (`/assets/*`) | **Bypass** — sin ellos la página no carga |
| **Todo lo demás** | **Allow** con la identidad corporativa |

Login, dashboard, pagos y mantenimiento siguen inalcanzables desde fuera.

### Costes que hay que aceptar

- **Cloudflare desaconseja `Bypass`** como práctica general para aplicaciones
  internas, y con razón en el caso típico —saltarse el login por comodidad—. El
  nuestro es distinto: son endpoints **diseñados para ser públicos**, con su propia
  autenticación por token. Aun así, **la política debe acotarse a esas rutas exactas**,
  nunca al dominio completo.
- **Se expone el bundle del frontend.** Servir esa página implica servir los estáticos,
  que son los de toda la aplicación. No hay secretos, pero queda visible la estructura
  de módulos y rutas. Evitarlo exigiría compilar un bundle aparte, bastante más
  trabajo.
- **Cloudflare termina el TLS**, así que ve el tráfico, incluida la URL con el token.
  Es decisión de dirección, no técnica.

### Qué hay que confirmar

- [ ] ¿Cómo abre el contador el enlace de `/pagos/revision`? (la pregunta de arriba)
- [ ] ¿Lo que hay es WARP/Zero Trust o un `cloudflared` con *public hostname*?
- [ ] Si ya hay dominio público, ¿cuál? Es el valor de
      `INTERNATIONAL_PURCHASES_INVITE_BASE_URL`.
- [ ] ¿HTTPS con certificado válido? Un enlace con token sobre HTTP es un credencial
      en claro. Cloudflare lo resuelve solo.
- [ ] ¿Sistemas o dirección aprueban que un tercero escriba en la base, aunque sea
      sobre una tabla acotada, con enlace revocable y ciclo de revisión?

**Responde:** responsable de infraestructura + dirección.
**Estado:** pendiente. **Es lo único que impide poner la Fase 2 en producción.**

---

## 7. n8n · Refresco selectivo del webhook — **manual, opcional**

**No bloquea nada.** Es una optimización: hoy funciona todo sin ella.

**Situación actual.** El webhook `international-purchases/register-tracking` **ignora
por completo su cuerpo**. Todo el payload que manda `triggerInternationalPurchasesTracking`
(`trigger`, `source`, `requestedBy`, `shipment{…}`) se descarta en `Set Request_ID`, y
el webhook funciona como un simple «recorre todos los embarques activos ahora».

Para el portal eso **basta**: al corregir un MBL, el sondeo completo incluye ese
embarque igualmente. La mejora sería consultar solo el embarque afectado en vez de los
13+ activos, ahorrando llamadas a SafeCube.

**Se intentó y se revirtió.** El intento fue parametrizar el `SELECT`:

```sql
SELECT * FROM international_purchases.v_active_shipments_for_tracking
WHERE NULLIF($1, '') IS NULL
   OR shipment_id = NULLIF($1, '')::uuid;
```

con `queryReplacement = {{ $json.target_shipment_id || '' }}`. **Falla en el nodo.** La
causa más probable: n8n resuelve `queryReplacement` como lista separada por comas, y
cuando el valor es cadena vacía la entrada queda en blanco y el nodo acaba enviando
cero parámetros a una consulta que declara `$1` (*bind message supplies 0 parameters,
but prepared statement requires 1*).

**Cómo hacerlo bien, si algún día se retoma.** Evitar el parámetro opcional; construir
dos caminos en vez de uno:

1. En `Set Request_ID`, emitir también `target_shipment_id` desde
   `$json.body?.shipment?.shipmentId ?? ''`.
2. Meter un nodo **IF** después: ¿`target_shipment_id` está vacío?
3. Rama **sí** → el `SELECT *` de siempre, sin parámetros.
4. Rama **no** → un `SELECT` aparte **con** `WHERE shipment_id = $1::uuid` y
   `queryReplacement = {{ $json.target_shipment_id }}`, que siempre lleva valor.
5. Unir ambas ramas hacia `GET Shipment`.

Dos consultas separadas, cada una con un número fijo de parámetros. Es la forma
robusta con el nodo Postgres de n8n.

**Estado:** pendiente, sin prioridad. Anotado también en la nota adhesiva del workflow.

---

## Resumen

| # | Punto | Bloquea | Responde | Estado |
| --- | --- | --- | --- | --- |
| 1 | Corrección de `tracking_key` en n8n | — | n8n | **Resuelto** |
| 2 | Uso de la columna `bl` | Paso B de `bl` | Otros consumidores | Casi resuelto |
| 3 | Webhook de invitación | Fase 2 | n8n | **Construido**, falta importar |
| 4 | `CHECK` sobre `source_type` | — | BD | **Resuelto** |
| 5 | Vistas del listado | — | BD | **Resuelto** |
| 6 | Alcance desde internet | Fase 2 | Infraestructura | Pendiente |
| 7 | Refresco selectivo del webhook | — | n8n | Opcional |

**La Fase 1 ya no está bloqueada.** Con el punto 3 construido, **lo único que condiciona
de verdad la Fase 2 es el punto 6**: si el portal no es alcanzable desde internet, el
forwarder no puede abrir el formulario y no hay nada que hacer. El punto 7 es una
optimización sin prioridad.

---

## Cambios aplicados al workflow (05/08/2026)

`docs/workflows/Flujo_principal_tracking.json` incluye tres correcciones sobre el
original. Va en `docs/workflows/` y no en `docs/n8n/` porque `.gitignore` excluye
cualquier carpeta llamada `n8n` —regla pensada para los datos de la aplicación— y no
merece la pena debilitarla por esto.
Ninguna cambia el comportamiento en el camino feliz; las tres evitan que un caso
excepcional tumbe la actualización.

| # | Nodo | Qué corrige |
| --- | --- | --- |
| 1 | `UPDATE ETA And Dates` | `updated_at` es **NOT NULL**, pero la expresión evaluaba a `NULL` si SafeCube no mandaba `metadata.updatedAt` → error 23502 y **se perdía también la actualización de fechas**. Ahora `COALESCE(..., updated_at)` |
| 2 | `UPDATE ETA And Dates` | `shipment_status` y `shipment_type` se escribían tal cual desde la API, y ambos tienen `CHECK`. Un valor nuevo reventaba el `UPDATE` entero con 23514. Ahora un valor desconocido se ignora y se conserva el anterior |
| 3 | Los 4 nodos `AUDIT ERR *` | No tenían `onError`, así que un fallo al auditar rompía la propia rama de error. Ahora llevan `continueRegularOutput`, como el resto de nodos de auditoría |

**Codificación:** el JSON original llegó con los acentos corrompidos (`AUDIT Ãxito
Final`, `EjecuciÃ³n`). La copia del repositorio está en UTF-8 correcto y la clave
`ultima_actualización` se renombró a `ultima_actualizacion` sin acento, por fragilidad
dentro de las expresiones de n8n. **Comparar los nombres de nodo antes de sobrescribir
en producción:** si allí estaban mal, al importar se crearían nodos duplicados en vez
de reemplazarse.

**La Fase 0 (deuda técnica: gate unificado, clasificación de errores y Paso A de `bl`)
no depende de ninguno de estos puntos** y puede desarrollarse y desplegarse en
paralelo.
