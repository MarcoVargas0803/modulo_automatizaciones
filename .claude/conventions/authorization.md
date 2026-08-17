### Autorización previa

1. **Al iniciar una tarea nueva**, preguntar al usuario: "¿Creo una rama `feature/<descripcion>` para esto?"
2. **No editar archivos del sistema base** (App.jsx, DashboardLayout, backend/src/app.js, docker-compose.yml de producción) sin autorización explícita.
3. **Ejecutar `npm run lint` en frontend** antes de dar una tarea por terminada.
4. **Recordar al usuario** que haga el PR y solicite revisión a su compañero antes de mergear.

---

### Archivos que Podrían Requerir Modificación (Solo con Autorización)

- `frontend/src/App.jsx` — Para agregar las rutas del módulo dentro del DashboardLayout
- `frontend/src/shared/layouts/DashboardLayout/DashboardLayout.jsx` — Para agregar el item del módulo en la barra lateral
- `backend/src/app.js` — Para registrar el router del módulo
- `docker-compose.yml` (producción) — Nunca confundirlo con `docker-compose.dev.yml`
- `package.json` (frontend o backend) — Cualquier dependencia nueva
