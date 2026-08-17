# BACKEND-DESIGN.md — Arquitectura del servidor (referencia para agentes)

**Módulo de Automatizaciones — Maderas Rivero S.A. de C.V.**

Punto de partida obligatorio antes de escribir o modificar cualquier cosa en `backend/`.
Contiene lo que **no** cambia con cada refactor: reglas, cadenas de acceso, utilidades y trampas.

Este archivo es la referencia completa: la página `/documentacion?vista=backend` del portal
original **no está en este repositorio**. Para el catálogo real de rutas, volcar
`app.router.stack` (el comando está en [`lint-validation.md`](backend-specific-rules/lint-validation.md)):
es lo único que no puede quedarse desactualizado.

> **Regla de oro:** antes de escribir un helper, un gate de acceso o una validación, buscarlo en
> [`backend-specific-rules/utilidades-existentes.md`](backend-specific-rules/utilidades-existentes.md).
> Antes de un gate por proceso, usar `requireProcess`: reimplementar su consulta a mano ya fue un
> problema real en dos módulos del portal original.

## Convenciones

Rutas de convenciones y aspectos a tomar en cuenta para el desarrollo del backend.

@backend-specific-rules/reglas-duras.md
@backend-specific-rules/ciclo-vida-request.md
@backend-specific-rules/seguridad-credenciales.md
@backend-specific-rules/utilidades-existentes.md
@backend-specific-rules/datos-integraciones.md
@backend-specific-rules/lint-validation.md
@backend-specific-rules/trampas-conocidas.md
@backend-specific-rules/deuda-abierta.md

## Mapa de módulos

**53 endpoints en 15 archivos de rutas agrupados en 6 módulos**, todos montados bajo `/api`
(conteo verificado recorriendo `app.router.stack`, no a ojo). Cada módulo expone un router
agregado en `modules/<m>/index.js`, que es lo único que `app.js` conoce.

| Módulo (`modules/…`)      | Archivos de rutas                                      | Endpoints | Gate                                                                                |
| ------------------------- | ------------------------------------------------------ | --------- | ----------------------------------------------------------------------------------- |
| `platform`                | `health` · `db` · `processes`                          | 3         | Solo `requireAuth` (`health` es público)                                            |
| `auth`                    | `auth.routes.js`                                       | 3         | —                                                                                   |
| `executions`              | `executions` · `dashboard` · `data-quality` · `export` | 12        | `requireAuth` + filtro por permisos en el SQL (`export` valida `can_export` aparte) |
| `international-purchases` | `international-purchases*.routes.js` (4 archivos)      | 17        | `requireProcess('international_purchases')`, salvo `-public` (token de invitación)  |
| `material-revaluations`   | `material-revaluations*.routes.js` (2 archivos)        | 7         | `requireProcess('material_revaluation')`, salvo `notify` (token de n8n)             |
| `admin`                   | `admin.routes.js`                                      | 11        | `requireProcess('admin')`                                                           |

`executions` absorbe `dashboard`, `data-quality` y `export` porque los cuatro comparten los
mismos cuatro helpers (`utils/accessControl`, `executionFilters`, `validateExecutionQuery`,
`pagination`), que por eso son privados del módulo.

**`executions` es transversal, no un proceso de negocio.** Sirve el Dashboard General, los
Registros y —lo que importa para los otros dos módulos— `ProcessAudit`, la vista del rol
`auditor_maestro`. `ProcessGuard` del frontend redirige a `/auditoria/<proceso>` cuando el
usuario tiene ese rol, así que **eliminar `executions` dejaría a los auditores sin destino**.
Sus dos endpoints por proceso (`dashboard-summary` y `audit-financials`) viven en cada módulo,
no en `executions`: el Dashboard solo conoce la URL.
