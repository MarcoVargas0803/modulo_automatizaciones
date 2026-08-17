## Reglas de decisión

**¿Qué uso para comunicar algo?**

| Situación                                               | Componente                |
| ------------------------------------------------------- | ------------------------- |
| Resultado de una acción del usuario (guardar, exportar) | `Toast`                   |
| Condición persistente de la página (falta un permiso)   | `Alert`                   |
| La zona no tiene datos                                  | `EmptyState`              |
| Falló la carga y se puede reintentar                    | `EmptyState` con `action` |
| Estado de un registro en tabla o tarjeta                | `Badge`                   |
| Aclarar un encabezado o un dato                         | `Hint`                    |
| Esperando datos                                         | `isLoading` del propio componente; si no lo tiene, `Skeleton` |

**Estado → variante de `Badge`** (mapeo canónico, aplicar siempre):

| Estado                               | Variante  |
| ------------------------------------ | --------- |
| Pendiente, en espera, incompleto     | `warning` |
| En proceso, en tránsito, ejecutando  | `info`    |
| Exitoso, completado, aprobado        | `success` |
| Error, fallido, rechazado, cancelado | `error`   |
| Sin estado o desconocido             | `default` |

> `StatusBadge` **invierte** pendiente y en proceso. Al migrar una tabla a `Badge`, aplicar la tabla de arriba, no conservar el color anterior.
