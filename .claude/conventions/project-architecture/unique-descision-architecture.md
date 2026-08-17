## Regla única de decisión

> **Si lo usa un solo módulo, vive dentro del módulo.
> Cuando un segundo módulo lo necesita, sube a `shared/`.**

No se sube nada a `shared/` "por si acaso". La promoción se hace en el momento en
que aparece el segundo consumidor, no antes.

**Excepción documentada:** un componente listado en el inventario de
[`components-inventory.md`](../frontend-specific-rules/components-inventory.md) es
contrato público y vive en `shared/components/` aunque hoy tenga un solo consumidor.
Ejemplos actuales: `ConfirmDeleteModal`, `Pagination` y `FilterBar`, los tres con un
único consumidor (compras internacionales).

**El corolario también aplica.** Un componente compartido que se queda **sin ningún**
consumidor se retira; no se conserva "por si vuelve". Al extraer este repositorio se
retiraron cuatro por esa regla (`BulkActionBar`, `ImageViewer`, `Textarea`, `Label`) y
siguen recuperables desde `modulo-reportes`.
