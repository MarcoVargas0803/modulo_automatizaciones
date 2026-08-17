### Ejecutar Backend/Frontend en Modo Local (Fuera de Docker)

Si se prefiere correr los servicios directamente en la máquina host:

```bash
# Backend
cd backend
npm install
npm run dev          # nodemon en http://localhost:3001

# Frontend
cd frontend
npm install
npm run dev          # Vite; proxea /api al backend (localhost:3001)

# Linter del frontend
cd frontend
npm run lint         # oxlint
```

### Nota sobre el Proxy de Vite

El proxy del frontend (`frontend/vite.config.js`) usa `VITE_API_TARGET` para definir el backend de destino:

| Contexto                 | Variable                                                 | Valor                     |
| ------------------------ | -------------------------------------------------------- | ------------------------- |
| Docker Compose Dev       | `VITE_API_TARGET` (definido en `docker-compose.dev.yml`) | `http://backend_dev:3001` |
| Host local (npm run dev) | Por defecto                                              | `http://localhost:3001`   |
| Producción               | Variable de entorno al hacer build                       | Ajustable según deploy    |

---
