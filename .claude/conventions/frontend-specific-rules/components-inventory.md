## Inventario de componentes

Todos en `frontend/src/shared/components/<Nombre>/<Nombre>.jsx` salvo donde se indique.

> **23 componentes.** El portal original tenía 27: al extraer este repositorio se retiraron
> `BulkActionBar`, `ImageViewer`, `Textarea` y `Label`, que se quedaron sin ningún consumidor.
> Si un módulo nuevo necesita uno de ellos, **recuperarlo del repositorio `modulo-reportes`** en
> vez de escribirlo otra vez: los cuatro estaban terminados y con JSDoc.

### Primitivos de formulario

| Componente | Para qué                                                           | Props clave                                                                               |
| ---------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `Button`   | Botón base                                                         | `variant` `primary\|secondary\|ghost\|danger\|icon`, `isLoading`, `leftIcon`, `rightIcon` |
| `Input`    | Campo de una línea                                                 | `label`, `id`, `error`, + atributos de `<input>`                                          |
| `Select`   | Desplegable                                                        | `label`, `id`, `options[]` **o** `children`, `placeholder`, `error`                       |

### Feedback y estado

| Componente   | Para qué                                                                                                                          | Props clave                                                                          |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `Alert`      | Aviso en bloque, condición persistente                                                                                            | `variant` `info\|success\|warning\|error`, `title`, `onDismiss`                      |
| `Toast`      | Aviso efímero. **No es un componente**: `useToast()` dentro de `ToastProvider`                                                    | `toast.success/error/info(msg, {duration, action})`                                  |
| `Badge`      | Píldora de estado. **Canónico**                                                                                                   | `variant` `default\|success\|error\|warning\|info\|primary`, `size` `sm\|md`, `icon`, `hint` (+`hintPosition`) |
| `Hint`       | Tooltip de ayuda (portal)                                                                                                         | `text`, `position` `top\|bottom\|left\|right`                                        |
| `EmptyState` | Sin datos / error reintentable                                                                                                    | `icon`, `title`, `description`, `action={{label,onClick}}`                           |
| `Skeleton`   | Carga: `SkeletonProvider` (en `App.jsx`), `Skeleton` (pass-through de `react-loading-skeleton`) y `SkeletonRepeat` (N hermanos, para rejillas). `PageSkeleton` está aparte, en `Skeleton/PageSkeleton.jsx` | `Skeleton`: todas las de la librería · `SkeletonRepeat`: `count` + las de `Skeleton` |

### Datos

| Componente         | Para qué                                           | Props clave                                                                   |
| ------------------ | -------------------------------------------------- | ----------------------------------------------------------------------------- |
| `DataTable`        | Tabla controlada (no ordena ni pagina por sí sola) | `columns[]`, `data[]`, `isLoading`, `skeletonRows`, `onRowClick`, `sortBy`/`sortDir`/`onSort` |
| `StatusBadge`      | En `DataTable.jsx`. **Obsoleto** → usar `Badge`    | `status`                                                                      |
| `DataCard`         | Tarjeta de métrica                                 | `title`, `value`, `icon`, `tone`, `isLoading`, `linkText`+`linkHref`          |
| `Pagination`       | Controles de paginación                            | `page`, `totalPages`, `onPageChange`, `pageSize`, `onPageSizeChange`          |
| `RelatedDocuments` | Documentos SAP en una celda                        | `documents[]`, `emptyLabel`                                                   |

### Superposiciones

`Modal` + `ModalFooter` (`isOpen`, `onClose`, `title`, `subtitle`) · `ConfirmDeleteModal` · `SessionExpiredModal`

### Filtros

`FilterBar` (`searchValue`, `onSearchChange`, `chips[]`, `onApply`, `onClear`) · `FilterChips` · `FilterSearchBox` · `FilterSelectField` · `FilterDateField` (los tres últimos en `FilterBar/FilterFields.jsx`; **devuelven el valor, no el evento**).

### Estructura y ruteo

| Componente              | Para qué                                                                                                   | Props clave                                                                                                                                                                                                   |
| ----------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PageHeader`            | Cabecera de página (`<h1>`, una por pantalla)                                                              | `title`, `subtitle`, `actions`                                                                                                                                                                                |
| `Tabs` + `Tab`          | Selector de vista dentro de una página                                                                     | `Tabs`: `value`, `onChange`, `ariaLabel` · `Tab`: `value`, `label`, `icon`, `badge`, `disabled`                                                                                                               |
| `TreeView` + `TreeItem` | Navegación jerárquica (menús con subsecciones). Compound: los hijos de un `TreeItem` lo convierten en rama | `TreeView`: `defaultExpandedIds`, `expandedIds`/`onExpandedChange`, `selectedId`, `onSelect`, `variant` `surface\|sidebar`, `ariaLabel` · `TreeItem`: `id`, `label`, `icon`, `to`, `end`, `badge`, `disabled` |
| `DashboardLayout`       | Marco de la app (en `layouts/`). No se instancia a mano                                                    | —                                                                                                                                                                                                             |
| `ProtectedRoute`        | Ruta de layout que exige sesión. **No comprueba el proceso**                                               | —                                                                                                                                                                                                             |
| `ProcessGuard`          | Restringe una página a su proceso; no monta los hijos hasta confirmarlo. Exporta también `ProcessAccessDenied` para el 403 en caliente | `processCode`, `moduleName`, `className`, `children`                                                                                                                                                          |
| `ErrorBoundary`         | Red de seguridad ante error de render                                                                      | `children` (se resetea con `key`)                                                                                                                                                                             |

### Dominio (un solo uso, no reutilizar)

`ShipmentFormModal` · `ShipmentFormFields` · `ShipmentDetailsModal`, los tres en `modules/international-purchases/components/`. Los tres tienen JSDoc completo.

> No hay clones de `FilterBar`: compras internacionales consume el compartido. El clon que existió (`ShipmentsFilterBar`) se retiró en el portal original y no llegó aquí.

---
