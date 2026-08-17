# CLAUDE.md — Módulo de Automatizaciones (Maderas Rivero)

## Resumen del Proyecto

Portal web de procesos automatizados para **Maderas Rivero S.A. de C.V.** Su propósito es centralizar y dar trazabilidad a procesos operativos de la empresa. El proyecto consta de un backend en Node.js + Express 5 con PostgreSQL, y un frontend SPA en React 19 + Vite.

Sirve **dos procesos de negocio**: revaluación de material y compras internacionales; más tres módulos transversales: `auth` (login), `executions` (dashboard general y registros de n8n) y `admin` (usuarios, permisos, bitácora y sesiones).

> **Este repositorio es una extracción de `modulo-reportes`**, del que se retiraron mantenimiento, pagos, compras de refacciones y la página de documentación del sistema de diseño. Los módulos se irán reincorporando de uno en uno.
>
> **Consecuencia que hay que tener presente:** `shared/` (frontend y backend) existe en los dos repositorios y **diverge**. Una corrección en un componente o utilidad compartida hay que portarla a mano al otro repositorio; no hay submódulo ni paquete que lo sincronice.

### Stack Tecnológico

| Capa          | Tecnología                                                  |
| ------------- | ----------------------------------------------------------- |
| Backend       | Node.js 22, Express 5, PostgreSQL (`pg`)                    |
| Frontend      | React 19, Vite 8, React Router 7                            |
| Autenticación | JWT en cookie + CSRF doble cookie                           |
| Estilos       | CSS nativo con Custom Properties (sistema de diseño propio) |
| Iconos        | `lucide-react`                                              |
| Integraciones | n8n (webhooks para SAP y tracking)                          |

---

## Reglas transversales

Aplican a **todo** el proyecto, sin importar el módulo ni la capa que se toque.

@.claude/conventions/contraste-tecnico.md
@.claude/conventions/cambios-minimos-efectivos.md
@.claude/conventions/authorization.md
@.claude/conventions/security.md
@.claude/conventions/git-workflow.md

## Entorno de trabajo

@.claude/conventions/entorno-desarrollo-local.md
@.claude/conventions/ejecutar-docker-frontend-backend.md

---

## Guía de Desarrollo

### Antes de crear cualquier archivo

Leer [`architecture.md`](.claude/conventions/architecture.md): convención de carpetas (`shared/` vs `modules/`), alias `@/`, reglas de dependencia entre módulos y pasos para agregar un módulo nuevo. Define **dónde** va cada archivo; `frontend-design.md` y `backend-design.md` definen **cómo** se escribe.

@.claude/conventions/architecture.md

### Antes de tocar el frontend

Leer [`frontend-design.md`](.claude/conventions/frontend-design.md): reglas duras, tokens de diseño, inventario de componentes y reglas de decisión. Es el punto de partida obligatorio para no reimplementar algo que ya existe.

El detalle (props completas, trampas de cada componente) vive en el JSDoc de `frontend/src/shared/components`, con cobertura completa. **Es la única fuente de verdad**: la página `/documentacion` del portal original no está en este repositorio, así que no hay documentación viva que consultar como fallback.

@.claude/conventions/frontend-design.md

### Antes de tocar el backend

Leer [`backend-design.md`](.claude/conventions/backend-design.md): reglas duras, ciclo de vida de un request, cadenas de middlewares canónicas, inventario de utilidades y trampas conocidas. Mismo propósito que `frontend-design.md`, para el servidor.

@.claude/conventions/backend-design.md

> **Importante:** Antes de desplegar, verificar que el `docker-compose.yml` de producción es el correcto (no el `docker-compose.dev.yml`).
