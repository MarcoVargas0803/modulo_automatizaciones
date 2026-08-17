### Estructura del frontend

```
frontend/src/
├── main.jsx, App.jsx, index.css             # arranque y rutas (no hay App.css)
├── assets/                                  # fuentes y logo
├── shared/                                  # núcleo: lo que usan ≥2 módulos
│   ├── components/    # primitivos del design system (Button, Modal, DataTable…)
│   ├── utils/         # apiClient, csrf, formatters, processAccess, statusVariant,
│   │                  # relativeTime
│   ├── context/       # AuthContext
│   └── layouts/       # DashboardLayout + Topbar
└── modules/
    ├── admin/                     # Administración de usuarios y accesos
    ├── auth/                      # Login
    ├── executions/                # Dashboard, Logs, LogDetail, ProcessAudit
    ├── international-purchases/   # Compras internacionales / embarques
    └── material-revaluations/     # Revaluaciones de material
```

No hay `shared/hooks/`: su único archivo (`useAutoDismiss`) ya no tenía consumidores
y se retiró. La carpeta se recrea cuando un hook lo use de verdad **desde dos
módulos**; con uno solo, vive dentro del módulo.

#### Anatomía de un módulo

Ninguna subcarpeta es obligatoria: se crea cuando hace falta.

```
modules/<modulo>/
├── pages/         # vistas montadas en App.jsx (una carpeta por página)
├── components/    # componentes usados solo por este módulo
├── hooks/         # hooks propios (ej. useAdminApi, useDashboardData)
├── utils/         # helpers propios (ej. shipmentWarnings, chartTheme)
└── <modulo>-shared.css   # estilos compartidos entre páginas del módulo
```
