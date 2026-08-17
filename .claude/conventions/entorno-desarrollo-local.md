### Entorno de Desarrollo Local

Se utiliza `docker-compose.dev.yml` para levantar **PostgreSQL local + Backend con nodemon + Frontend con Vite** en contenedores con hot-reload. No requiere SSH ni conexión al servidor de producción.

```bash
# Levantar el entorno completo (BD + Backend + Frontend)
docker compose -f docker-compose.dev.yml up --build

# Ver los logs en tiempo real
docker compose -f docker-compose.dev.yml logs -f

# Detener los servicios
docker compose -f docker-compose.dev.yml down

# Detener y eliminar volúmenes (borra datos locales de BD)
docker compose -f docker-compose.dev.yml down -v
```

**Accesos locales:**

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:3001`
- PostgreSQL: `localhost:5432` (usuario: `n8n`, contraseña: `_@2026`, base: `n8n_dev`)
