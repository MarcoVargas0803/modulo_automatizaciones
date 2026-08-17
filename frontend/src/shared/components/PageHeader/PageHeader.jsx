import React from 'react';
import { Link } from 'react-router-dom';
import './PageHeader.css';

/**
 * PageHeader — Cabecera estándar de página: migas, título, subtítulo y acciones.
 *
 * **Una por pantalla**, porque emite un `<h1>` fijo. No permite cambiar el nivel
 * del encabezado, así que no sirve para las cabeceras de sección dentro de una
 * página.
 *
 * ── Trampas ──────────────────────────────────────────────────────────────────
 * - **Quedan cuatro páginas con la cabecera hecha a mano**, y no migran solo con
 *   `className` y `children`: `SupplierAccounts` y `PaymentsReconciliation`
 *   meten el `<h1>` en un bloque de intro con kicker y párrafo
 *   (`.cuentas-intro`, `.conciliacion-intro`), `PaymentsReconciliation` además
 *   necesita `ref` y `tabIndex` para gestión de foco, y `LogDetail` usa
 *   `.detail-title`. Falta soporte de `kicker`, `ref` y `headingLevel`.
 * - `breadcrumb` usa `<Link>`, así que **exige estar dentro del Router**. Hoy no
 *   lo usa ninguna página.
 *
 * `.page-header` estuvo definida tres veces de forma global —aquí, en
 * `Dashboard.css` y en un `@media` de esa misma hoja—, así que el aspecto
 * dependía de qué página hubiera visitado el usuario antes. Hoy la única fuente
 * es `PageHeader.css`, que apila la cabecera por debajo de 640px.
 *
 * @param {string|React.ReactNode}            [title]      - Título de la página en `<h1>`. Sin él no se dibuja el encabezado. Acepta un nodo: `PageSkeleton` le pasa un `Skeleton` para que herede el tamaño real del título.
 * @param {string|React.ReactNode}            [subtitle]   - Texto secundario bajo el título. También acepta un nodo, por el mismo motivo.
 * @param {React.ReactNode}                   [actions]    - Controles alineados a la derecha (crear, exportar…).
 * @param {{label: string, href: string}[]}   [breadcrumb] - Migas de pan. El último elemento se pinta como texto, no como enlace.
 * @param {string}                            className    - Clases extra para `.page-header`. (default: '')
 * @param {React.ReactNode}                   [children]   - Contenido extra dentro del bloque de texto, bajo el subtítulo.
 *
 * @example
 * // El uso más común
 * <PageHeader
 *   title="Solicitudes de mantenimiento"
 *   subtitle="Alta, seguimiento y cierre de solicitudes."
 * />
 *
 * @example
 * // Con acciones a la derecha
 * <PageHeader
 *   title="Compras internacionales"
 *   subtitle="Embarques y documentos asociados."
 *   actions={
 *     <>
 *       <Button variant="secondary" leftIcon={<Download size={16} />}>Exportar</Button>
 *       <Button variant="primary" leftIcon={<Plus size={16} />}>Nuevo embarque</Button>
 *     </>
 *   }
 * />
 *
 * @example
 * // Con migas de pan: el último elemento es la página actual
 * <PageHeader
 *   breadcrumb={[
 *     { label: 'Mantenimiento', href: '/mantenimiento' },
 *     { label: 'Catálogos', href: '/mantenimiento/catalogos' },
 *   ]}
 *   title="Catálogos"
 * />
 */
export function PageHeader({ title, subtitle, actions, breadcrumb, className = '', children }) {
  return (
    <div className={`page-header ${className}`}>
      <div className="page-header-text">
        {breadcrumb && breadcrumb.length > 0 && (
          <ol className="page-header-breadcrumb" aria-label="Ruta de navegación">
            {breadcrumb.map((crumb, i) => (
              <li key={i}>
                {i < breadcrumb.length - 1 ? (
                  <>
                    <Link to={crumb.href}>{crumb.label}</Link>
                    <span className="page-header-breadcrumb-sep" aria-hidden="true">/</span>
                  </>
                ) : (
                  <span aria-current="page">{crumb.label}</span>
                )}
              </li>
            ))}
          </ol>
        )}
        {title && <h1 className="page-header-title">{title}</h1>}
        {subtitle && <p className="page-header-subtitle">{subtitle}</p>}
        {children}
      </div>

      {actions && (
        <div className="page-header-actions">
          {actions}
        </div>
      )}
    </div>
  );
}
