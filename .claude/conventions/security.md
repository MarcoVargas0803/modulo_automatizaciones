## Seguridad

- Todas las rutas del módulo deben usar el middleware `requireAuth` para validar sesión JWT.
- Las operaciones de escritura (POST, PUT) deben validar CSRF mediante `requireCsrf`.
- Las operaciones de elimnación (DELETE) deben de contar con las validaciones correspodientes además de contar con validaciones a nivel de usuario para realizar la operación, ejemplo: Crear una ventana modal para avisar al usuario de realizar una cierta eliminación.
- La subida de imágenes debe limitarse a 5 MB y aceptar solo formatos `image/jpeg`, `image/png`, `image/webp`.
- El control de acceso por proceso debe utilizar la tabla `audit_portal.user_process_access` (vía `requireProcess`) para restringir cada módulo a sus usuarios autorizados. Nunca comparar `username` contra un literal.
