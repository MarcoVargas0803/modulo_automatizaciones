# FRONTEND-DESIGN.md — Sistema de diseño (referencia para agentes)

**Módulo de Automatizaciones — Maderas Rivero S.A. de C.V.**

Punto de partida obligatorio antes de escribir o modificar cualquier cosa en `frontend/`.
Contiene lo que **no** cambia con cada refactor: tokens, inventario y convenciones.

El detalle de cada componente (props, trampas, ejemplos) está en el **JSDoc** de
`frontend/src/shared/components`, con cobertura completa. **Es la única fuente de verdad**: la
página `/documentacion` del portal original no está en este repositorio, así que no hay
documentación viva de respaldo. Al modificar un componente, actualizar su JSDoc en el mismo
commit; al crear uno, escribirlo desde el principio — el modelo a copiar es `Button.jsx` o
`Modal.jsx`.

La contrapartida de servidor es [`backend-design.md`](backend-design.md).

> **Regla de oro:** antes de crear un componente, una clase CSS o un color, buscarlo en el
> inventario. Si existe, se usa. El portal original arrastraba una veintena larga de clases
> locales que reimplementaban componentes ya existentes.

## Convenciones

Rutas de convenciones y aspectos a tomar en cuenta para el desarrollo del frontend.

@frontend-specific-rules/reglas-duras.md
@frontend-specific-rules/tokens.md
@frontend-specific-rules/components-inventory.md
@frontend-specific-rules/rule-decisions.md
@frontend-specific-rules/trampas-conocidas.md
@frontend-specific-rules/deuda-abierta.md
