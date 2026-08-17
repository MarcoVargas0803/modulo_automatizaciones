### Agregar un módulo nuevo

Los pasos marcados tocan archivos base: requieren **autorización previa** del
usuario (ver `authorization.md`).

**Frontend**

1. Crear `modules/<nombre>/pages/<Pagina>/<Pagina>.jsx`.
2. Registrar la ruta en `App.jsx` con `lazy(() => import('@/modules/<nombre>/…'))`
   — el code-splitting depende de que el import sea dinámico. **Autorización previa.**
3. Añadir el item de menú en `shared/layouts/DashboardLayout/DashboardLayout.jsx`.
   **Autorización previa.**

**Backend**

1. Crear `modules/<nombre>/<nombre>.routes.js` e `index.js`.
2. Registrarlo en `app.js` con `require('./modules/<nombre>')` y `app.use('/api', …)`.
   **Autorización previa.**
3. Verificar con `npm run lint` (frontend) y con la comprobación del grafo de
   requires descrita en `backend-specific-rules/lint-validation.md`.
