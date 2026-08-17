- **El cache de `requireAuth` es de la sesión entera, no de `is_active`.** Vive en
  `shared/services/session.service.js` y su clave es `${userId}:${sid}`: una sola consulta con
  `LEFT JOIN` resuelve el estado del usuario y el de su sesión, así que cada petición cuesta un
  viaje a la base, cacheado 60 s. Al revocar por usuario hay que borrar **todas** sus entradas,
  porque la clave lleva el `sid` y quien revoca no sabe cuáles había vivos: de eso se encarga
  `invalidateUserCache`.
- **La invalidación del cache es del proceso, no del despliegue.** Hoy producción corre un solo
  contenedor (`docker-compose.yml`, `node src/server.js`, sin réplicas ni cluster), así que
  desactivar un usuario o expulsar un dispositivo surte efecto en el acto. **El día que se escale
  en horizontal**, una revocación tardará hasta 60 s en verse desde las otras réplicas.
- **`requireProcess` depende de una vista.** Todo el control de acceso por proceso pasa por
  `audit_portal.v_user_process_access_effective`, que corre en **cada request**. Si esa vista
  falta o cambia de forma, **el portal entero responde 403** —no un módulo—, y el síntoma no
  apunta a la causa. Su DDL no está en Git.
- **`globalErrorHandler` oculta el mensaje real en 5xx** y responde «Error interno del servidor».
  Depurar por los logs, nunca por la respuesta HTTP.
- **Los errores de `logActivity` se tragan** a propósito: una acción puede completarse sin dejar
  registro de auditoría y nadie se entera. Es el precio de que un fallo de log no tumbe la
  operación.
- **El `statement_timeout` del pool es global** (30 s por defecto, `DB_STATEMENT_TIMEOUT_MS`). Una
  operación legítima más lenta hay que subirla por entorno, no ignorar el error.
- **`GET /api/material-revaluations/stream` es SSE y no se trata como un endpoint normal.**
  Mantiene la conexión abierta; el cliente se registra en `revaluationEvents.js` (estado en
  memoria) y hay que quitarlo al cerrar, o el proceso acumula respuestas muertas.
- **El router público de compras internacionales va PRIMERO en su `index.js`.** Si se mueve
  detrás, una ruta con sesión captura antes `/international-purchases/public/...` y el
  forwarder —que no tiene cuenta— recibe un 401 en lugar del formulario.
- **`findUsableInvite` devuelve motivos opacos a propósito.** No distingue hacia fuera «no
  existe» de «revocada» de «caducada»: quien prueba tokens al azar no debe poder averiguar
  cuáles existieron. El motivo real sí queda en el log.
- **`admin` no tiene `ProcessGuard` en el frontend.** El backend sí exige
  `requireProcess('admin')` en las 11 rutas, así que no hay hueco de datos; lo que falta es que
  la página no se monte cuando el usuario no tiene el proceso.

### Retiradas con sus módulos (para que nadie las busque)

El gate reimplementado a mano de `payments-layout.routes.js`, las cinco variables `PAYMENTS_*`
fuera de `env.js`, el `SAMPLE_ACCOUNTS_PAYABLE` de pagos y la ruta de mantenimiento sin rate
limiter. **`PAYMENTS_REVIEW_SECRET` ya no existe en ningún archivo**: era deuda muerta que seguía
viva en `.env.example`, en el CI y en el compose de desarrollo aunque `env.js` no la leyera.

---
