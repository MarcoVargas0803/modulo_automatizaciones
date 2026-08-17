- **`shared/` está duplicado con `modulo-reportes` y diverge.** Es la deuda estructural que
  introduce este repositorio. No hay submódulo, paquete npm ni script que sincronice: una
  corrección en `session.service.js`, `access.middleware.js` o cualquier utilidad hay que
  portarla a mano al otro repo. Al reincorporar un módulo, comparar primero `shared/` entre los
  dos y decidir qué versión gana **antes** de copiar el módulo.
- **`audit` y `audit_portal` no tienen DDL versionado** ni hay herramienta de migraciones: un
  cambio de estructura no deja rastro en Git. Sí lo tienen `material_revaluations` y —en parte—
  `international_purchases`.
- **Tres tablas de `international_purchases` siguen sin DDL versionado**: `shipments`,
  `warning_catalog` (consultada por el router) y `shipment_tracking_history` (purgada en el PUT y
  en el DELETE) no aparecen en ningún `.sql` de `scripts/`. **Sí lo tienen** `registration_invites`,
  las vistas y `scac_catalog`, que nació con su script. Es el patrón a seguir: tabla nueva, DDL en
  el mismo PR.
- **El DDL de las vistas del portal no está en Git.** Se aplica a mano en cada entorno, incluida
  `audit_portal.v_user_process_access_effective`, de la que depende **todo** el control de acceso.
  La única forma de saber qué vistas existen es consultar la base.
- **`material_revaluations` separa objetos, no datos.** El esquema tiene la tabla de locks y 5
  vistas, pero los registros del proceso siguen en `audit.workflow_*` porque las vistas
  `v_execution_*` no filtran por proceso y el módulo `executions` los lista juntos.
- **`material_revaluations.product_locks` está acoplada a un workflow de n8n que no está en Git.**
  Los nodos `Acquire Product Locks` y `Release Product Locks` llevan cada uno un
  `CREATE TABLE IF NOT EXISTS` de esa tabla: si alguien reintroduce el nombre viejo
  (`audit.material_revaluation_product_locks`), n8n la recrea y el proceso queda partido en dos
  sin error visible.
- **No hay tests.** `package.json` declara `npm test` con `node --test "src/**/*.test.js"` pero no
  existe ni un archivo que lo cumpla: los únicos que había eran de pagos y se fueron con el
  módulo. La red de seguridad es el CI —lint + arranque + `GET /api/health`—, que valida que
  todos los routers cargan y que la validación de entorno pasa. Nada más.
- **`international-purchases.routes.js` supera las 1 000 líneas.** El módulo ya está partido por
  responsabilidad en 4 archivos (`-public`, `-dashboard`, `-invites` y el principal); lo que
  queda grande es una de las cuatro partes, no el módulo. Partirlo más exige acordar antes dónde
  vive la lógica, porque no hay capa de controladores.
- **`v_audit_data_quality` está muerta y no se puede adoptar.** Existe, tiene `GRANT` y nadie la
  usa, pero **ninguna de sus 5 ramas filtra por proceso accesible**. Como `/data-quality` solo
  lleva `requireAuth` y su filtro por `accessible_processes` **es** el control de acceso,
  consumirla filtraría conteos de procesos ajenos.
- **La fachada de embarques copia 36 columnas.** `audit_portal.v_international_purchases_shipments_web`
  solo añade la constante `process_code` sobre `international_purchases.v_shipments_portal`, pero
  repite su lista entera: exponer una columna nueva exige `CREATE OR REPLACE` en las dos, en ese
  orden. Es un patrón a **no** replicar en otros módulos.
- **`env.n8n.webhookAuthToken` protege el webhook entrante, pero no hay rotación.** Cambiarlo
  exige tocar el `.env` del servidor y el workflow de n8n a la vez; entre los dos pasos, la ruta
  responde 403 o 503.
