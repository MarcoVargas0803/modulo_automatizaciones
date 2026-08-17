1. **Reutilizar antes que escribir.** Antes de un helper nuevo, mirar `shared/utils/` y los `utils/` del módulo (`utilidades-existentes.md`). Antes de un
   gate, usar `requireProcess`.
2. **Toda variable de entorno pasa por `shared/config/env.js`.** Nunca `process.env` suelto en un router:
   `env.js` valida al arrancar y falla rápido con la lista de las que faltan.
3. **Respuesta uniforme.** Éxito `{ success: true, data, pagination? }`. Error, siempre
   `buildErrorResponse(mensaje, error)` desde el `catch`.
4. **SQL parametrizado, siempre.** Placeholders `$1..$n`. No hay ORM y no se interpola nada en la
   cadena de la consulta.
5. **El acceso se decide por SQL, nunca por `username`.** `requireProcess` consulta
   `audit_portal.user_process_access`. Comparar el nombre de usuario contra un literal fue un bug
   corregido; `shared/middlewares/access.middleware.js:3-6` lo documenta para que no vuelva.
6. **La lógica va en el router.** No hay `controllers/` ni `models/`, y no se van a introducir por
   una ruta suelta. A `services/` (del módulo o de `shared/`) solo baja lo que es puro, reutilizable y no toca Express.
   > **Única excepción viva:** `scacCatalogHandler`, en
   > `modules/international-purchases/services/scacCatalog.service.js`. Es un handler que sí toca
   > `req`/`res` y vive en `services/`, porque **dos routers exponen el mismo catálogo** —el
   > interno con sesión y el público con el token del forwarder— y lo único que los diferencia es
   > el guard, que sigue decidiendo cada router. La alternativa era duplicar el handler, que es el
   > problema que ese archivo existe para evitar. **No es precedente:** con un solo consumidor, el
   > handler se queda en el router.
7. **Sin dependencias nuevas** sin autorización explícita.

---
