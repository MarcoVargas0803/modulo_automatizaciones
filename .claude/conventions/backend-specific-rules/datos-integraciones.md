**Base de datos.** Un único pool de `pg`, sin ORM ni capa de repositorios: SQL a mano en los
routers. Cuatro esquemas:

| Esquema                   | Contenido                                                                           | DDL en el repo                                |
| ------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------- |
| `audit_portal`            | `users`, `user_process_access`, `processes`, `activity_log`, `user_sessions` + vistas `v_*_web` | **Solo `user_sessions` y la columna `auth_source`** — `src/scripts/schema-auth-sessions.sql` y `schema-auth-sap-source.sql` |
| `audit`                   | `workflow_execution`, `workflow_approvals`, `workflow_events`                       | **No**                                        |
| `material_revaluations`   | tabla de locks + 5 vistas (los datos siguen en `audit.workflow_*`)                  | **Sí** — `src/scripts/schema-material-revaluations.sql` |
| `international_purchases` | `shipments`, `shipment_tracking_history`, `warning_catalog`, `scac_catalog`, `registration_invites` + vistas | **Parcial** — 6 archivos `src/scripts/schema-international-purchases-*.sql`; `shipments`, `warning_catalog` y `shipment_tracking_history` **siguen sin DDL versionado** |

> La base del despliegue puede seguir teniendo los esquemas `maintenance` y `payments` y sus
> filas en `audit_portal.processes`: este repositorio ya no los sirve. Desactivar esos procesos
> (`is_active = false`) evita que la matriz de permisos de `/administracion` ofrezca acceso a
> módulos que no existen aquí.

**Integraciones.** Todo lo externo sale por un `services/`:

- **n8n** — 3 webhooks salientes (`triggerInternationalPurchasesTracking`,
  `triggerMaterialRevaluationSend`, `triggerForwarderInvite`) y 1 entrante:
  `POST /api/material-revaluations/notify`, protegido por `N8N_WEBHOOK_AUTH_TOKEN` (sin token
  configurado responde 503). Sin webhook configurado, el trigger devuelve `skipped` y la
  operación sigue: notificar nunca puede tumbar lo que la generó.
- **SAP** — solo para **verificar credenciales en el login**
  (`modules/auth/services/sap.service.js`): Login y Logout inmediato contra el Service Layer,
  con la contraseña de quien entra. No hay cuenta de servicio ni sesión mantenida, porque el
  módulo que las necesitaba (mantenimiento) no está en este repositorio. Afecta solo a los
  usuarios con `auth_source='sap'`.
- **Sinay** — catálogo SCAC y tracking de contenedores para compras internacionales, con cache
  de 24 h en memoria (`modules/international-purchases/services/scacCatalog.service.js`).
- **SSE** — `modules/material-revaluations/services/revaluationEvents.js` difunde a los clientes
  conectados, con filtro por usuario. Es lo que alimenta el contador del menú lateral.

**No hay tareas periódicas.** El portal completo tenía un scheduler
(`shared/scheduler.js`) con una sola tarea, la detección de recepción de mantenimiento; se
retiró con el módulo. Nada de lo que queda corre sin que alguien pulse algo, y el
razonamiento de por qué eso es deseable está en
`modules/international-purchases/utils/inviteToken.js`.

---
