import React, { useContext } from 'react';
import { TabsContext } from './tabs-context';
import './Tabs.css';

const NAV_KEYS = ['ArrowRight', 'ArrowLeft', 'Home', 'End'];

/**
 * Tabs — Selector de vista dentro de una página (lista/calendario, secciones de
 * un catálogo, pestañas de administración).
 *
 * Controlado: no guarda cuál pestaña está activa. Recibe `value` y avisa por
 * `onChange`; el estado vive en la página, que es quien decide qué pintar debajo.
 *
 * Implementa el contrato de `role="tablist"` que el markup manual del proyecto
 * nunca cumplió: navegación con ←/→/Inicio/Fin y roving tabindex, de modo que el
 * grupo entero es una sola parada de tabulación. La activación es automática
 * (mover el foco cambia de pestaña), que es lo recomendado cuando el contenido
 * ya está en memoria.
 *
 * @param {string}          value     - Valor de la pestaña activa
 * @param {(value) => void} onChange  - Recibe el valor de la pestaña elegida
 * @param {React.ReactNode} children  - Elementos <Tab>
 * @param {string}          ariaLabel - Describe el grupo para lectores de pantalla
 * @param {string}          className - Clases extra para el contenedor
 *
 * @example
 * <Tabs value={view} onChange={setView} ariaLabel="Modo de visualización">
 *   <Tab value="list" label="Vista Lista" icon={List} />
 *   <Tab value="calendar" label="Vista Calendario" icon={Calendar} />
 * </Tabs>
 */
export function Tabs({ value, onChange, children, ariaLabel, className = '' }) {
  const handleKeyDown = (event) => {
    if (!NAV_KEYS.includes(event.key)) return;

    // Se leen del DOM en lugar de mantener un registro de refs: el orden del DOM
    // ya es el orden visual, y así un <Tab> condicional no descuadra los índices.
    const tabs = Array.from(
      event.currentTarget.querySelectorAll('[role="tab"]:not([disabled])'),
    );
    if (tabs.length === 0) return;

    event.preventDefault();
    const current = tabs.indexOf(document.activeElement);

    let next;
    if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else if (current === -1) next = 0;
    else next = (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;

    tabs[next].focus();
    // Activación automática: el propio botón dispara su onClick, así que no hace
    // falta mapear posiciones del DOM a valores.
    tabs[next].click();
  };

  return (
    <TabsContext.Provider value={{ value, onChange }}>
      <div
        className={`tabs ${className}`}
        role="tablist"
        aria-label={ariaLabel}
        onKeyDown={handleKeyDown}
      >
        {children}
      </div>
    </TabsContext.Provider>
  );
}

/**
 * Tab — Una pestaña. Solo funciona dentro de <Tabs>.
 *
 * @param {string}          value    - Identificador; se compara con el value de Tabs
 * @param {React.ReactNode} label    - Texto de la pestaña
 * @param {React.ComponentType} icon - Componente de icono Lucide, no elemento. Se pinta a 16px
 * @param {React.ReactNode} badge    - Contador o distintivo tras el texto (p. ej. el número de registros)
 * @param {boolean}         disabled - Deshabilita la pestaña y la excluye del recorrido con flechas
 */
export function Tab({ value, label, icon: Icon, badge, disabled = false }) {
  const context = useContext(TabsContext);

  if (!context) {
    throw new Error('<Tab> debe usarse dentro de <Tabs>');
  }

  const isActive = context.value === value;

  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      // Roving tabindex: solo la pestaña activa es alcanzable con Tab; dentro del
      // grupo se navega con las flechas.
      tabIndex={isActive ? 0 : -1}
      className={`tab ${isActive ? 'active' : ''}`}
      disabled={disabled}
      onClick={() => context.onChange?.(value)}
    >
      {Icon && <Icon size={16} aria-hidden="true" />}
      {label}
      {badge != null && <span className="tab-badge">{badge}</span>}
    </button>
  );
}
