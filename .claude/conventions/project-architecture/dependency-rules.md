### Reglas de dependencia

Valen igual en frontend (`import`) y en backend (`require`).

1. `shared/` **no depende nunca** de `modules/`. Si algo compartido necesita
   saber de un módulo, está mal ubicado o mal diseñado.
2. Un módulo **no depende** de otro módulo. Si dos módulos necesitan lo mismo,
   ese algo pertenece a `shared/` (es lo que pasó con `n8n.service.js`, usado
   por tres módulos).
3. El punto único que conoce a todos los módulos es `App.jsx` en el frontend
   (rutas y `lazy()`) y `app.js` en el backend.
