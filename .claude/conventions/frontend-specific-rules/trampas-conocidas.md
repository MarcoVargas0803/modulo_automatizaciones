## Trampas conocidas

- **Una insignia con `hint` es un foco tabulable.** `Hint` pone `tabIndex={0}` y `role="button"` en su disparador. Dentro de una fila de `DataTable` con `onRowClick` —que también es `role="button"`— el evento burbujea, así que pulsar la insignia abriría el tooltip **y** dispararía la fila. La columna de advertencias de compras internacionales para la propagación en su contenedor; cualquier otro uso dentro de una fila pulsable tiene que hacer lo mismo.
- **`Toast` no tiene `warning`**, y `toast.error` dura 3 s frente a los 5 s del resto. Para un error accionable, pasar `{ duration: 0 }`.
- **`Hint` sin `text` desaparece** (devuelve sus children pelados) y **no se cierra con Escape ni tiene soporte táctil**: en móvil su contenido es inalcanzable.
- **`Input` necesita `id` sí o sí.** El id del error se deriva de él (`${id}-error`); sin `id` queda `undefined-error` y el enlace `aria-describedby` se rompe en silencio.
- **`Select` ignora `options` si recibe `children`.** Elegir una vía por uso. Su error tampoco se enlaza con `aria-describedby`.
- **`Alert` degrada en silencio una variante desconocida.** Cae entera a `info` sin avisar en consola: un `variant="danger"` copiado de `Button` se ve azul.
- **`ProtectedRoute` solo valida sesión, nunca el proceso.** Estar dentro de él no significa tener acceso al módulo. Para eso está `ProcessGuard` (`shared/components/ProcessGuard/`), que hay que aplicar **explícitamente**: no es automático por colgar de `ProtectedRoute`. Lo aplican revaluaciones y las dos páginas de compras internacionales; **siguen sin él `/administracion` y las 4 rutas de `executions`**.
- **`ProcessGuard` redirige al auditor a una ruta de `executions`.** Con rol `auditor_maestro` devuelve `<Navigate to={/auditoria/${processCode}} />`, que resuelve `ProcessAudit`. **Si algún día se retira `executions`, esa redirección deja al auditor en un bucle**: la ruta no existe → `*` → `/` → aterriza en el módulo → lo vuelve a expulsar. Los mismos destinos están en `DashboardLayout` para las dos ramas de proceso.
- **`ProtectedRoute` y `Login` están acoplados.** El destino tras caducar la sesión viaja en `state={{ from: location }}`; tocar una de las dos piezas sin la otra rompe el circuito. Además `Login` valida el destino contra `HOME_BY_PROCESS`: **al añadir un módulo hay que añadir su entrada ahí**, o un usuario podrá aterrizar en una página a la que no tiene acceso.
- **El `ErrorBoundary` raíz no se resetea nunca.** Fuera del Router no hay `pathname` del que derivar una `key`: una vez saltado, la única salida es recargar. Ninguno de los tres reporta a un servicio externo, solo a `console.error`.
- **`RelatedDocuments` lleva reglas de negocio de SAP dentro** (`formatDocumentName`, `ROLE_LABELS`). Un rol fuera del mapa se muestra en inglés junto a los traducidos.
- **`PageHeader` no cubre las cabeceras con kicker.** Acepta `className` y `children`, pero le faltan `kicker`, `ref` y `headingLevel`. `LogDetail` sigue usando `.detail-title` por eso.
- **A un `Skeleton` no se le pueden añadir atributos ARIA.** `react-loading-skeleton` construye su `<span>` con un juego fijo de atributos (`className`, `data-testid`, `aria-live="polite"`, `aria-busy`) y **no reenvía props desconocidas al DOM**: las trata como opciones de estilo. Un `aria-hidden` o un `role` pasados a `Skeleton` o a `SkeletonRepeat` se pierden en silencio. Si hace falta ocultar el grupo o anunciar la carga, se hace **en el contenedor de la página**. (`DataTable` y `PageSkeleton`, que sí emiten un `<div>` propio, llevan `role="status"` + `aria-busy`.)
- **`count` y `SkeletonRepeat` no son intercambiables.** El `count` de la librería mete las N barras en **un solo** elemento: dentro de un CSS grid ocupa una celda, no N. `count` es para líneas apiladas en un bloque normal; `SkeletonRepeat`, para rejillas y listas con `gap` propio.
- **No existe `role="tabpanel"` en toda la aplicación.** `Tabs` no emite `id` ni `aria-controls` y no hay un `TabPanel`, así que un lector de pantalla no asocia la pestaña con su panel.
- **`StatusBadge` (dentro de `DataTable.jsx`) invierte pendiente y en proceso.** Está obsoleto: usar `Badge` con la tabla canónica de `rule-decisions.md`, nunca conservar el color que pintaba.
- **El contador de revaluaciones vive en `DashboardLayout`, no en su módulo.** El SSE, el polling de 15 s, las notificaciones nativas y el sonido están en el layout, que escucha el evento `material-revaluations:updated` que emite la página. Tocar uno de los dos lados sin el otro rompe el contador del menú.

### Retiradas con sus módulos

`WarningTags` (sustituido por `Badge` con `hint` + `shipmentWarnings.js`), `ShipmentsFilterBar`
(clon de `FilterBar`) y los dos clones que quedaban vivos en el portal original
—`.payment-review-empty-row` y `.cuentas-paginacion`— eran de pagos. **No quedan clones de
componentes compartidos.**
