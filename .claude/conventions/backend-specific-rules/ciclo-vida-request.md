El orden importa y no es casual:

```
trust proxy → helmet (CSP) → cors → express.json (512 kb) → cookieParser → morgan
  → 16 routers bajo /api
  → /uploads (requireAuth + static)  → 404 JSON si el archivo no existe
  → express.static(public/)          → build del frontend
  → catch-all SPA                    → index.html si la ruta NO empieza por /api
  → notFoundHandler                  → 404 JSON
  → globalErrorHandler
```

Tres consecuencias prácticas:

- Un middleware colocado **antes de `cookieParser`** no ve ni la sesión ni el CSRF.
- Un middleware colocado **después del catch-all** no se ejecuta nunca para rutas de página.
- El catch-all excluye `/api` a propósito: si no, una ruta de API mal escrita devolvería el HTML
  de la SPA con un 200 y el frontend fallaría al parsear JSON en lugar de recibir un 404 claro.

`globalErrorHandler` **oculta el mensaje real cuando el status es ≥ 500** y responde
«Error interno del servidor». El detalle está en los logs, no en la respuesta.

---
