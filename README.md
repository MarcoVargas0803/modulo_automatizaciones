# Módulo de Automatizaciones — Maderas Rivero S.A. de C.V.

Portal web de procesos automatizados. Centraliza y da trazabilidad a dos procesos de negocio
—**revaluación de material** y **compras internacionales**— sobre una base transversal de
autenticación, panel general de ejecuciones de n8n y administración de usuarios.

> **Este repositorio es una extracción de [`modulo-reportes`](https://github.com/DesarrolloIAMaderasRivero/modulo-reportes).**
> Se retiraron mantenimiento, pagos, compras de refacciones y la página de documentación del
> sistema de diseño. Los módulos se irán reincorporando de uno en uno.
>
> **Consecuencia a tener presente:** `shared/` (frontend y backend) existe en los dos
> repositorios y **diverge**. Una corrección en un componente o utilidad compartida hay que
> portarla a mano; no hay submódulo ni paquete que lo sincronice.

---

## Stack

| Capa          | Tecnología                                                  |
| ------------- | ----------------------------------------------------------- |
| Backend       | Node.js 22, Express 5, PostgreSQL (`pg`)                    |
| Frontend      | React 19, Vite 8, React Router 7                            |
| Autenticación | JWT en cookie `httpOnly` + CSRF de doble cookie + sesión revocable en base |
| Estilos       | CSS nativo con Custom Properties (sistema de diseño propio) |
| Iconos        | `lucide-react`                                              |
| Integraciones | n8n (webhooks), SAP Service Layer (login), Sinay (tracking) |

---

## Secciones de la aplicación

| Ruta                                 | Qué es                                                     | Acceso                          |
| ------------------------------------ | ---------------------------------------------------------- | ------------------------------- |
| `/`                                  | Login                                                       | Público                         |
| `/compras/registro-embarque`         | Formulario que rellena el forwarder                         | **Público**, con token de invitación en la URL |
| `/dashboard`                         | Panel general de ejecuciones y KPIs por proceso             | Sesión                          |
| `/logs`, `/logs/:id`                 | Registros de ejecuciones de n8n y su detalle                | Sesión, filtrado por proceso    |
| `/revaluaciones`                     | Aprobación y rechazo de revaluaciones de material           | Proceso `material_revaluation`  |
| `/international-purchases`           | Listado y gestión de embarques                              | Proceso `international_purchases` |
| `/international-purchases/enlaces`   | Invitaciones a forwarders                                   | Proceso `international_purchases` |
| `/auditoria/:processCode`            | Vista de métricas del rol `auditor_maestro`                 | El proceso correspondiente      |
| `/administracion/:tab`               | Usuarios, matriz de permisos, bitácora, sesiones y sistema  | Proceso `admin`                 |

El acceso se decide siempre por `audit_portal.user_process_access`, nunca comparando el nombre
de usuario contra un literal.

---

## Estructura del repositorio

```
.
├── backend/          API Express — 53 endpoints en 6 módulos bajo /api
│   └── src/
│       ├── app.js, server.js
│       ├── shared/   config, pool de pg, middlewares, servicios y utils comunes
│       ├── modules/  platform · auth · executions · international-purchases
│       │             material-revaluations · admin
│       └── scripts/  DDL versionado (SQL) + generador de hash de contraseña
├── frontend/         SPA React + Vite
│   └── src/
│       ├── shared/   design system, contexto de sesión, layout
│       └── modules/  auth · executions · international-purchases
│                     material-revaluations · admin
├── docs/             workflows de n8n y pendientes de coordinación
├── .claude/          convenciones de desarrollo (contrato de equipo, se versionan)
├── Dockerfile        build multi-etapa: frontend → dist, servido por el backend
└── docker-compose.yml / docker-compose.dev.yml
```

La convención de dónde va cada archivo está en
[`.claude/conventions/architecture.md`](.claude/conventions/architecture.md); el cómo se escribe,
en [`frontend-design.md`](.claude/conventions/frontend-design.md) y
[`backend-design.md`](.claude/conventions/backend-design.md).

---

## Puesta en marcha

### Docker (recomendado)

Levanta PostgreSQL local, backend con nodemon y frontend con Vite, los tres con hot-reload:

```bash
docker compose -f docker-compose.dev.yml up --build
```

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:3001`
- PostgreSQL: `localhost:5432` (usuario `n8n`, base `n8n_dev`)

### Directamente en el host

```bash
cd backend  && npm install && npm run dev    # nodemon en :3001
cd frontend && npm install && npm run dev    # Vite en :5173, proxea /api a :3001
```

Copiar `backend/.env.example` a `backend/.env` y rellenarlo. Las únicas variables sin las que el
servidor **no arranca** son `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`,
`JWT_SECRET` y `FRONTEND_ORIGINS`; el resto tiene default y se degrada con aviso.

### Verificación antes de dar algo por terminado

```bash
cd backend  && npm run lint
cd frontend && npm run lint && npm run build
```

`oxlint` no detecta rutas de `require` rotas. Para eso está la comprobación del grafo, que
además vuelca la tabla real de rutas montadas: el comando está en
[`.claude/conventions/backend-specific-rules/lint-validation.md`](.claude/conventions/backend-specific-rules/lint-validation.md).

---

## Despliegue

`main` es la rama desplegable. Nunca se hace push directo: todo cambio pasa por una rama y un
Pull Request revisado. El flujo completo está en
[`.claude/conventions/git-workflow.md`](.claude/conventions/git-workflow.md).

```bash
git checkout main && git pull origin main
docker compose up -d --build      # OJO: el de producción, no docker-compose.dev.yml
```

> **Antes del primer despliegue**, comprobar dos cosas en el servidor:
>
> 1. El **puerto 3001 y la red `n8n_n8n_net`** los usa también `modulo-reportes`. Si los dos
>    portales van a convivir, cambiar el mapeo de puerto en `docker-compose.yml` y ajustar el
>    proxy que tenga delante. El `container_name` ya es distinto.
> 2. Los procesos que este portal **no** sirve (`payments`, `maintenance`, `purchasing`) siguen
>    en `audit_portal.processes`. Desactivarlos (`is_active = false`) evita que la matriz de
>    permisos de `/administracion` ofrezca acceso a módulos que aquí no existen.
