## Tokens (`frontend/src/index.css`)

**Marca** · `--color-primary` `#421e04` · `--color-on-primary` `#ffffff` · `--color-primary-container` `#5c3317` · `--color-on-primary-container` `#d69b77` · `--color-secondary` `#8c4f00` · `--color-on-secondary` `#ffffff` · `--color-secondary-container` `#fd9923` · `--color-on-secondary-container` `#663800`

**Superficies** · `--color-background` `#fcf9f8` · `--color-on-background` `#1b1c1c` · `--color-surface` `#fcf9f8` · `--color-surface-elevated` `#ffffff` · `--color-on-surface` `#1b1c1c` · `--color-surface-variant` `#e4e2e1` · `--color-on-surface-variant` `#51443d` · `--color-sidebar-bg` `#421e04` (oscuro en ambos temas) · `--skeleton-base` · `--skeleton-shine`

**Bordes y texto atenuado** · `--color-outline` `#84746c` · `--color-outline-variant` `#d6c3b9` · `--color-divider` `#e0d9d4` · `--color-muted-text` `#70635d`

**Semánticos** — cada familia tiene cuatro tokens: `X`, `on-X`, `X-container`, `on-X-container`.

| Familia             | Base      | Container | Uso                         |
| ------------------- | --------- | --------- | --------------------------- |
| `--color-error-*`   | `#ba1a1a` | `#ffdad6` | Fallo, rechazo, cancelación |
| `--color-success-*` | `#166534` | `#dcfce7` | Éxito, completado, aprobado |
| `--color-warning-*` | `#92400e` | `#fef3c7` | Pendiente, requiere acción  |
| `--color-info-*`    | `#1e3a5f` | `#dbeafe` | En proceso, informativo     |
| `--color-stuck-*`   | `#6b21a8` | `#f3e8ff` | Atascado, bloqueado (tono propio, ni el ámbar de warning ni el naranja de marca) |

> Regla de contraste: sobre `X` va `on-X`; sobre `X-container` va `on-X-container`. Nunca mezclar.
>
> `--color-stuck-*` es un token **disponible**, agregado a `index.css` (`Badge` ya lo acepta como variante). Hoy nada lo consume por defecto: `rule-decisions.md` sigue mapeando "atascada"/"incompleta" a `warning` (comparte familia con "pendiente"), y cambiar ese mapeo es una decisión de producto aparte — no se hizo de forma unilateral al agregar el token.

**Tipografía** · `--font-body` / `--font-headline` / `--font-label` = `'Satoshi', system-ui, sans-serif` (misma familia a propósito) · `--font-mono` para datos que se alinean en columna (folios, importes). **No hay tokens de tamaño ni de peso.**

**Espaciado** (escala 4px) · `--spacing-0` **4px** · `-1` 8px · `-2` 16px · `-3` 24px · `-4` 32px · `-5` 40px · `-6` 48px · `-7` 56px · `-8` 64px. Ojo: la escala **empieza en 4px**, no en 0.

**Radios** · `--radius-sm` 4px · `-md` 8px · `-lg` 12px · `-xl` 16px · `-full` 9999px

**Sombras** · `--shadow-1` (sutil) · `--shadow-2` (elevada) · `--shadow-modal`

**Z-index** · `--z-base` 0 · `--z-dropdown` 100 · `--z-sticky` 200 · `--z-modal` 9000 · `--z-toast` 9999

**Transiciones** · `--transition-fast` 150ms · `--transition-base` 200ms · `--transition-slow` 300ms · `--ease-standard` `cubic-bezier(0.4, 0, 0.2, 1)` (curva del sistema; **no volver a escribirla a mano**, estaba repetida en cinco reglas de `DashboardLayout.css`)

**Tema oscuro:** `:root[data-theme="dark"]` redeclara **solo colores y sombras**. Un componente que use tokens funciona en ambos temas sin escribir una sola regla extra. Un color literal, no.

**Utilidades globales** (ya definidas, no reimplementar): `.label-text` · `.data-text` · `.muted-text` · `.action-link` · `.truncate-single` · `.is-refreshing` · `.fade-in` · `.fade-in-delayed`.

**Aparición de contenido.** Existe un único `@keyframes fade-in` (solo opacidad, nunca desplazamiento) y la regla es **anima quien cambia de estado, no quien acompaña**: lo que llega junto con la página ya entra dentro del fundido del contenedor de ruta (`.fade-in` con `key={pathname}` en `App.jsx`), así que animarlo otra vez apila dos fundidos sobre lo mismo. Lo traen de fábrica `DataTable`, `DataCard`, `Alert`, `EmptyState` y el panel de `FilterBar`; `.fade-in-delayed` añade 120 ms de espera y es para placeholders, de modo que una carga rápida no llegue a mostrarlos. Para un refresco que no debe parpadear, `.is-refreshing` atenúa sin desmontar. Un `@media (prefers-reduced-motion: reduce)` global anula **toda** animación con selector universal: una animación nueva no necesita su propia regla.

---
