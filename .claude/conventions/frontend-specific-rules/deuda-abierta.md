## Deuda abierta (no "arreglar" a medias)

- **`shared/` está duplicado con `modulo-reportes` y diverge.** Es la deuda estructural que
  introduce este repositorio. Los 23 componentes, los 4 utils, el contexto de sesión y el
  `DashboardLayout` existen en los dos repos y no hay nada que los sincronice: una corrección
  hay que portarla a mano. Al reincorporar un módulo, **comparar `shared/` entre los dos repos
  primero** y decidir qué versión gana antes de copiar nada.
- **Quedan rutas protegidas sin gate de proceso**: `/administracion` y las 4 de `executions`
  (`/dashboard`, `/logs`, `/logs/:id`, `/auditoria/:processCode`). El backend sí las protege
  —`admin` con `requireProcess('admin')`, `executions` filtrando por procesos accesibles dentro
  del SQL—, así que no hay hueco de datos; lo que falta es no montar la página. Y son **dos**
  cosas distintas: las rutas que aún no lo aplican, y que **el guard se aplica dentro de cada
  página en vez de como ruta de layout en `App.jsx`**, que es donde debería estar.
- **`ProcessGuard` no comprueba el rol para decidir el acceso**, solo el proceso. Sí lo lee para
  desviar al `auditor_maestro`. Un módulo que necesite gate por rol tiene que añadírselo, no
  copiar el patrón en su página.
- **`Tabs` no emite `id`/`aria-controls` y no hay `TabPanel`**: no existe `role="tabpanel"` en
  toda la aplicación.
- **Dos mecanismos de tooltip**: `Hint` con portal y el `title` nativo de `RelatedDocuments`.
- **`PageHeader` sigue sin `kicker`, `ref` ni `headingLevel`**, que es lo que impide migrar la
  cabecera de `LogDetail` (usa `.detail-title`).
- **Cobertura de JSDoc: completa en `shared/components`.** **Mantenerla:** al modificar un
  componente, actualizar su JSDoc en el mismo commit; al crear uno, escribirlo desde el
  principio — el modelo es `Button.jsx` o `Modal.jsx`. Ahora es **la única** documentación del
  design system, porque `/documentacion` no está en este repositorio. Sigue **sin JSDoc** lo que
  queda fuera de esa carpeta: `DashboardLayout` (`shared/layouts/`) y las páginas de módulo. Los
  tres componentes de dominio de compras internacionales **sí lo tienen**, completo.
- **El rol del menú y el de las páginas se leen de la misma fuente**, `getProcessAccess` sobre
  los procesos de la sesión. Eso ya está bien; lo que hay que **no** volver a hacer es comparar
  `username` contra un literal, que fue un bug real del portal original.

> **Orden obligatorio:** al limpiar una clase global de la que otra página depende por fuga,
> **migrar esa página primero**, nunca al revés. Sigue aplicando a lo que queda en
> `Dashboard.css`, empezando por el override huérfano de `.data-card-title`.
