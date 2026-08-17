## Reglas duras

1. **Reutilizar antes que crear.** Crear un componente nuevo exige avisar al usuario y justificarlo.
2. **Solo tokens.** Nunca colores, sombras ni radios literales en CSS. Todo sale de `frontend/src/index.css`.
3. **Iconos solo de `lucide-react`.** Se pasa el _componente_ (`icon={Filter}`), no el elemento.
4. **Named export:** `export function Nombre() {}`. Sin `export default` (única excepción histórica: `Hint`).
5. **Un `.css` por componente**, en su misma carpeta e importado desde su `.jsx`. Nunca estilar un componente desde el CSS de una página.
6. **Nomenclatura CSS:** guion simple (`alert-error`, `data-card-title`). No usar BEM (`toast__icon` existe, pero es minoría y no es el patrón a seguir).
7. **Sin dependencias nuevas** sin autorización explícita.

---
