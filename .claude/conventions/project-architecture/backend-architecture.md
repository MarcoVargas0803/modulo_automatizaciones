### Estructura del backend

Misma regla de decisión y mismos nombres de carpeta que el frontend.

```
backend/src/
├── server.js, app.js                # arranque y montaje de módulos
├── shared/                          # núcleo: lo que usan ≥2 módulos
│   ├── config/env.js                # única puerta a process.env
│   ├── db/pool.js                   # pool de pg (singleton)
│   ├── middlewares/                 # access, auth, csrf, error, rate-limit
│   ├── services/n8n.service.js      # lo usan compras y revaluaciones
│   ├── services/session.service.js  # lo usan auth y admin
│   └── utils/                       # errorResponse, activityLog, csv, pgError,
│                                    # toNumber, parsePositiveInt
├── modules/
│   ├── platform/                    # health, db/health, processes
│   ├── auth/                        # login, me, logout (+ verificación SAP)
│   ├── admin/                       # usuarios, procesos, actividad, sesiones
│   ├── executions/                  # ejecuciones, dashboard, data-quality, exports
│   ├── international-purchases/
│   └── material-revaluations/
└── scripts/                         # SQL de esquema/migración/semilla (fuera del
                                     # grafo de require; se agrupan aparte a propósito)
```

#### Anatomía de un módulo

```
modules/<modulo>/
├── index.js            # router agregado — lo único que app.js conoce
├── <modulo>.routes.js  # uno o varios archivos de rutas
├── services/           # servicios propios del módulo
└── utils/              # helpers propios del módulo
```

`index.js` monta los routers del módulo en un solo `express.Router()`:

```js
const express = require("express");

const router = express.Router();

router.use(require("./international-purchases-public.routes"));
router.use(require("./international-purchases-dashboard.routes"));
router.use(require("./international-purchases-invites.routes"));
router.use(require("./international-purchases.routes"));

module.exports = router;
```

**El orden dentro de `index.js` importa** cuando dos archivos del mismo módulo
comparten prefijo (el caso de los 4 de `international-purchases`): Express resuelve
por orden de registro, y por eso el router **público** va primero — si fuera detrás,
`/international-purchases/public/...` lo capturaría antes una ruta con sesión. Entre
módulos distintos da igual, porque cada uno tiene su propio primer segmento de ruta.

CommonJS no tiene alias equivalente al `@/` del frontend: las rutas de `require`
son relativas (`../../shared/db/pool` desde un `*.routes.js`).
