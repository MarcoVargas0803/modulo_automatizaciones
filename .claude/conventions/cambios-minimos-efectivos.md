## Regla Fundamental: Cambios Mínimos y Efectivos

Todo agente que trabaje en **cualquier módulo de este proyecto** (`admin`, `auth`, `executions`, `international-purchases`, `material-revaluations`, `platform`) debe adherirse estrictamente a las siguientes reglas:

1. **NO modificar archivos, componentes, rutas, dependencias o servicios existentes del sistema a menos que sea absolutamente indispensable para la funcionalidad del módulo.**
   > Cuidado propio de este repositorio: `shared/` está duplicado con `modulo-reportes` y diverge. Tocar un componente o una utilidad compartida crea una diferencia entre los dos repos que alguien tendrá que reconciliar a mano.
2. **Si se requiere modificar un archivo preexistente** (ej. `App.jsx`, `DashboardLayout.jsx`, `backend/src/app.js`, `package.json`), el agente **debe notificar al usuario antes de hacerlo**, explicando por qué es necesario y qué alternativas se evaluaron.
3. **No agregar dependencias nuevas** (librerías npm, paquetes Python, etc.) sin autorización explícita. Preferir siempre la solución con las herramientas ya disponibles en el proyecto.
4. **Mantener la coherencia visual:** usar exclusivamente las variables CSS definidas en `frontend/src/index.css` y los iconos de `lucide-react`. Además de usar los componentes ya existentes `frontend/src/shared/components`, en dado caso que sea necesario agregar un nuevo componente **se debe notificar al usuario antes de hacerlo** y el razón del porque. No introducir sistemas de estilos externos.
5. **No alterar la arquitectura de autenticación, sesiones, middlewares de seguridad o esquemas de base de datos existentes** (`audit_portal`, `audit`) a menos que el usuario lo autorice.
