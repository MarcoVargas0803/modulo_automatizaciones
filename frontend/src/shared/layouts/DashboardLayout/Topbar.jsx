import React, { useEffect, useRef, useState } from 'react';
import { Bell, BellOff, Sun, Moon, LogOut, ChevronDown } from 'lucide-react';
import './Topbar.css';

/**
 * Topbar — Barra superior global, hermana de la sidebar dentro de `DashboardLayout`.
 *
 * Centraliza tres controles que antes vivían en el pie de la sidebar (tema,
 * avisos de revaluaciones, cerrar sesión). No añade lógica de negocio: los
 * handlers y el estado (tema, permiso de avisos, logout) siguen viviendo en
 * `DashboardLayout`, este componente solo los expone en un lugar que no
 * depende de que la sidebar esté expandida.
 *
 * No lleva buscador (v3 lo tuvo, se retiró en la Parte X: no aportaba donde
 * estaba y no era parte del pedido original — un control sin trabajo real
 * que hacer es ruido, no integración).
 *
 * Vive junto a `DashboardLayout` (no en `shared/components`) porque es
 * infraestructura de un único layout, no un componente de propósito general.
 *
 * @param {{displayName?: string, username?: string}} [user]
 * @param {boolean} isDarkTheme
 * @param {() => void} onToggleTheme
 * @param {boolean} showNotifications - Si hay proceso de revaluaciones y el navegador soporta avisos nativos.
 * @param {boolean} notificationsActive
 * @param {() => void} onToggleNotifications
 * @param {number} pendingCount - Revaluaciones pendientes, ya calculado en DashboardLayout.
 * @param {() => void} onLogout
 */
export function Topbar({
  user,
  isDarkTheme,
  onToggleTheme,
  showNotifications,
  notificationsActive,
  onToggleNotifications,
  pendingCount = 0,
  onLogout,
}) {
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef(null);

  useEffect(() => {
    if (!isUserMenuOpen) return undefined;

    const handleClickOutside = (event) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setIsUserMenuOpen(false);
      }
    };

    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [isUserMenuOpen]);

  const displayName = user?.displayName || user?.username || 'Usuario';
  const initials = displayName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('') || 'U';

  return (
    <header className="topbar">
      <div className="topbar-actions">
        {showNotifications && (
          <button
            type="button"
            className="topbar-icon-btn"
            onClick={onToggleNotifications}
            title="Avisos del navegador para nuevas revaluaciones"
            aria-label="Avisos del navegador para nuevas revaluaciones"
          >
            {notificationsActive ? <Bell size={18} /> : <BellOff size={18} />}
            {pendingCount > 0 && <span className="topbar-badge">{pendingCount}</span>}
          </button>
        )}

        <button
          type="button"
          className="topbar-icon-btn"
          onClick={onToggleTheme}
          title={isDarkTheme ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          aria-label={isDarkTheme ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
        >
          {isDarkTheme ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        <div className="topbar-user" ref={userMenuRef}>
          <button
            type="button"
            className="topbar-user-trigger"
            onClick={() => setIsUserMenuOpen((value) => !value)}
            aria-expanded={isUserMenuOpen}
            aria-haspopup="true"
          >
            <span className="topbar-user-avatar">{initials}</span>
            <span className="topbar-user-name">{displayName}</span>
            <ChevronDown size={14} />
          </button>

          {isUserMenuOpen && (
            <div className="topbar-user-menu" role="menu">
              <button
                type="button"
                className="topbar-user-menu-item"
                role="menuitem"
                onClick={() => {
                  setIsUserMenuOpen(false);
                  onLogout();
                }}
              >
                <LogOut size={16} />
                Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
