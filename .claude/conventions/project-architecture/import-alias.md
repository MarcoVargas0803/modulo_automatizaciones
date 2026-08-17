### Alias de imports

`@` apunta a `frontend/src` (definido en `vite.config.js` y `jsconfig.json`).

| Caso                                | Forma                                                        |
| ----------------------------------- | ------------------------------------------------------------ |
| Archivo en la misma carpeta         | `import './Button.css'`                                      |
| Cualquier otro archivo del proyecto | `import { Button } from '@/shared/components/Button/Button'` |

Nunca usar cadenas `../../..`: si el import sale de la carpeta actual, usa `@/`.
Así mover un módulo no obliga a recalcular rutas.
