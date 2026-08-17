## Estrategia de Ramas e Integración (Git Workflow)

### Principios Fundamentales

1. **Nunca hacer push directo a `main`**. Todo cambio debe pasar por una rama de feature y un Pull Request.
2. **Probar siempre en local antes de subir a producción.** Usar `docker compose -f docker-compose.dev.yml up --build` para validar.
3. **Mantener `main` siempre en estado desplegable.** Si `main` está roto, se detiene el desarrollo hasta repararlo.

### Estructura de Ramas

```
main                    # Producción — solo se hace merge vía PR aprobado
├── feature/nombre-tarea  # Ramas de trabajo para nuevas funcionalidades
└── fix/nombre-parche     # Ramas para correcciones de bugs
```

### Flujo de Trabajo Diario

#### 1. Iniciar una nueva tarea

Siempre partir desde la rama `main` actualizada:

```bash
git checkout main
git pull origin main
git checkout -b feature/descripcion-corta-de-la-tarea
```

Ejemplos de nombres de rama:

- `feature/endpoint-lista-embarques`
- `feature/ui-dashboard-embarques`
- `fix/corregir-conexion-base-datos`
- `fix/validar-campos-solicitud`

#### 2. Desarrollar y probar en local

```bash
# Opción A — Entorno Docker (recomendada)
docker compose -f docker-compose.dev.yml up --build

# Realizar cambios en el código...

# Verificar linter antes de commit
cd frontend
npm run lint
```

#### 3. Realizar commits atómicos

Cada commit debe representar un cambio lógico completo y funcionar de forma independiente:

```bash
git add <archivos>
git commit -m "tipo: descripción breve del cambio"
```

**Convención para mensajes de commit:**

| Tipo        | Cuándo usarlo                                     |
| ----------- | ------------------------------------------------- |
| `feat:`     | Nueva funcionalidad                               |
| `fix:`      | Corrección de bug                                 |
| `refactor:` | Cambio que no agrega funcionalidad ni corrige bug |
| `style:`    | Cambios de formato, espacios, etc. (sin lógica)   |
| `docs:`     | Cambios en documentación                          |
| `chore:`    | Cambios en build, dependencias, configuración     |

Ejemplos:

```
feat: agregar endpoint GET /api/international-purchases/shipments
fix: corregir filtro de busqueda por proveedor
refactor: extraer lógica de KPIs a servicio separado
chore: actualizar proxy de Vite para entorno local
```

#### 4. Sincronizar con main (evitar conflictos grandes)

Si la tarea toma más de un día, es buena práctica rebasar (`rebase`) contra `main` para mantener la rama actualizada:

```bash
git checkout feature/mi-rama
git rebase main
# Resolver conflictos si los hay, luego:
git push origin feature/mi-rama --force-with-lease
```

#### 5. Publicar la rama y crear Pull Request

```bash
git push origin feature/descripcion-corta-de-la-tarea
```

Crear un Pull Request en GitHub con:

- **Título descriptivo** que indique qué se implementa.
- **Descripción** con el contexto del cambio, qué archivos se modificaron y por qué.
- **Lista de verificación:**
  - [ ] Probado en entorno local (`docker compose -f docker-compose.dev.yml up --build`)
  - [ ] Linter pasa sin errores (`npm run lint`)
  - [ ] No se modificaron archivos del sistema base sin autorización (regla #1 y #2 de AGENTS.md)

#### 6. Revisión y merge a main

- El compañero (o el agente) revisa el PR.
- Si hay comentarios, se hacen los ajustes necesarios en la misma rama.
- Una vez aprobado, se hace **merge a `main`** desde la interfaz de GitHub (preferir "Squash and merge" para mantener el historial limpio).
- **NUNCA** aprobar y mergear un PR propio sin revisión de otro compañero.

#### 7. Despliegue a Producción

Una vez que el PR está mergeado en `main`, desplegar en el servidor:

```bash
ssh agente_ia@192.168.20.206
cd /ruta/del/proyecto   # ajustar según la ruta real en el servidor
git checkout main
git pull origin main
docker compose up -d --build
```
