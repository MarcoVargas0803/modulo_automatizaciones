import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ClipboardCheck, LayoutDashboard, Link as LinkIcon, List, Ship, ChevronLeft, ShieldCheck, Users, Table2, Activity, ServerCog, History } from 'lucide-react';
import logoImage from '@/assets/logo_maderas_rivero_secundario.png';
import { apiFetch } from '@/shared/utils/apiClient';
import { useAuth } from '@/shared/context/useAuth';
import { useToast } from '@/shared/components/Toast/useToast';
import { SessionExpiredModal } from '@/shared/components/SessionExpiredModal/SessionExpiredModal';
import { TreeView, TreeItem } from '@/shared/components/TreeView/TreeView';
import { getProcessAccess, hasProcessAccess } from '@/shared/utils/processAccess';
import { Topbar } from './Topbar';
import './DashboardLayout.css';

const REVALUATIONS_UPDATED_EVENT = 'material-revaluations:updated';
const NOTIFICATIONS_ENABLED_KEY = 'materialRevaluations.nativeNotificationsEnabled';
const NOTIFIED_REVALUATIONS_KEY = 'materialRevaluations.notifiedExecutionIds';
const PENDING_POLL_INTERVAL_MS = 15000;

// Qué rama del árbol de navegación corresponde a cada ruta. Se usa para abrirla
// sola al entrar o al navegar; el usuario puede colapsarla después a mano.
const ROUTE_BRANCHES = [
  { prefix: '/revaluaciones', branch: 'revaluaciones' },
  { prefix: '/international-purchases', branch: 'compras' },
  { prefix: '/administracion', branch: 'administracion' },
];

function branchForPath(pathname) {
  return ROUTE_BRANCHES.find((entry) => pathname.startsWith(entry.prefix))?.branch ?? null;
}

function canUseNativeNotifications() {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;

  return (
    window.isSecureContext ||
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1'
  );
}

function getStoredNotifiedIds() {
  try {
    const stored = window.localStorage.getItem(NOTIFIED_REVALUATIONS_KEY);
    const parsed = stored ? JSON.parse(stored) : [];

    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function persistNotifiedIds(ids) {
  try {
    window.localStorage.setItem(
      NOTIFIED_REVALUATIONS_KEY,
      JSON.stringify(Array.from(ids).slice(-100)),
    );
  } catch {
  }
}

function getPendingId(item) {
  return String(item?.execution?.execution_id || item?.approval?.id || '');
}

function describePendingItem(item) {
  const freightFolio = item?.review?.freightFolio || item?.execution?.execution_id || 'Revaluación';
  const docNum = item?.review?.docNum || 'Sin traspaso';

  return `${freightFolio} | Traspaso(s): ${docNum}`;
}

// Aviso audible sintetizado (no requiere archivo ni permisos). El AudioContext
// arranca "suspended" hasta que hay interacción del usuario; como el operador usa
// la pantalla, ya queda desbloqueado. Si el navegador lo bloquea, falla en silencio.
let sharedAudioContext = null;

function playAlertSound() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    sharedAudioContext = sharedAudioContext || new AudioContextClass();
    if (sharedAudioContext.state === 'suspended') sharedAudioContext.resume();

    const ctx = sharedAudioContext;
    const now = ctx.currentTime;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();

    oscillator.connect(gain);
    gain.connect(ctx.destination);

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, now);
    oscillator.frequency.setValueAtTime(660, now + 0.15);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.3, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);

    oscillator.start(now);
    oscillator.stop(now + 0.45);
  } catch {
  }
}

export function DashboardLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const { user, processes: sessionProcesses, isChecking: sessionChecking, logout } = useAuth();
  const sessionChecked = !sessionChecking;

  const [pendingRevaluations, setPendingRevaluations] = useState(0);
  const [nativeNotificationsEnabled, setNativeNotificationsEnabled] = useState(() =>
    window.localStorage.getItem(NOTIFICATIONS_ENABLED_KEY) === 'true',
  );
  const [nativeNotificationPermission, setNativeNotificationPermission] = useState(() =>
    canUseNativeNotifications() ? window.Notification.permission : 'unsupported',
  );

  const notifiedIdsRef = useRef(getStoredNotifiedIds());
  const pendingIdsRef = useRef(new Set());
  const hasLoadedPendingRef = useRef(false);
  const originalTitleRef = useRef(document.title);
  const nativeEnabledRef = useRef(nativeNotificationsEnabled);
  const nativePermissionRef = useRef(nativeNotificationPermission);

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem('maderasRivero.sidebarCollapsed') === 'true';
    } catch {
      return false;
    }
  });

  const [isDarkTheme, setIsDarkTheme] = useState(
    () => document.documentElement.getAttribute('data-theme') === 'dark',
  );

  // Expansión del árbol de navegación. No se persiste en localStorage a
  // propósito, al contrario que el tema y el colapso de la barra: guardar ids
  // dejaría estado obsoleto en cuanto un usuario pierda acceso a un proceso.
  const [expandedNodes, setExpandedNodes] = useState(() => {
    const branch = branchForPath(window.location.pathname);

    return branch ? [branch] : [];
  });

  // Al navegar, se abre la rama del apartado en el que se entra. Solo añade: si
  // el usuario colapsó otra a mano, se respeta.
  useEffect(() => {
    const branch = branchForPath(location.pathname);
    if (!branch) return;

    setExpandedNodes((prev) => (prev.includes(branch) ? prev : [...prev, branch]));
  }, [location.pathname]);

  const toggleTheme = () => {
    setIsDarkTheme((prev) => {
      const next = !prev;
      document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light');
      try {
        window.localStorage.setItem('maderasRivero.theme', next ? 'dark' : 'light');
      } catch {}
      return next;
    });
  };

  const toggleSidebar = () => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem('maderasRivero.sidebarCollapsed', String(next));
      } catch {}
      return next;
    });
  };

  useEffect(() => {
    nativeEnabledRef.current = nativeNotificationsEnabled;
  }, [nativeNotificationsEnabled]);

  useEffect(() => {
    nativePermissionRef.current = nativeNotificationPermission;
  }, [nativeNotificationPermission]);

  // El menu se arma con los permisos de la sesion, no con el nombre del usuario:
  // asi un usuario dado de alta desde el modulo maestro ve lo que le corresponde.
  const canAccessRevaluations = hasProcessAccess(sessionProcesses, 'material_revaluation');
  const canAccessInternationalPurchases = hasProcessAccess(sessionProcesses, 'international_purchases');
  const canAccessAdmin = hasProcessAccess(sessionProcesses, 'admin');
  const isAdminOnly = canAccessAdmin && sessionProcesses.length === 1;

  // El auditor ve métricas, no la herramienta: su rama del proceso es una sola
  // entrada a la vista de auditoría, no las subpáginas operativas.
  const isComprasAuditor = getProcessAccess(sessionProcesses, 'international_purchases')?.role === 'auditor_maestro';
  const isRevaluacionesAuditor = getProcessAccess(sessionProcesses, 'material_revaluation')?.role === 'auditor_maestro';

  const nativeActive =
    nativeNotificationsEnabled && nativeNotificationPermission === 'granted';

  useEffect(() => {
    if (pendingRevaluations <= 0) {
      document.title = originalTitleRef.current;
      return undefined;
    }

    // Misma gramática en las dos fases del parpadeo (paréntesis, sin emoji):
    // antes alternaba "(N) Revaluaciones pendientes" con "🔔 N pendiente(s)",
    // dos formatos distintos que no se leían como el mismo aviso.
    const countTitle = `(${pendingRevaluations}) Revaluaciones pendientes`;
    const alertTitle = `(${pendingRevaluations}) ¡Revisar pendientes!`;

    document.title = countTitle;
    let showAlert = false;
    const interval = window.setInterval(() => {
      showAlert = !showAlert;
      document.title = showAlert ? alertTitle : countTitle;
    }, 1200);

    return () => {
      window.clearInterval(interval);
      document.title = originalTitleRef.current;
    };
  }, [pendingRevaluations]);

  const showNativeNotification = useCallback((items) => {
    if (!canUseNativeNotifications()) return;
    if (!nativeEnabledRef.current) return;
    if (nativePermissionRef.current !== 'granted') return;

    for (const item of items) {
      const id = getPendingId(item);
      if (!id || notifiedIdsRef.current.has(id)) continue;

      const notification = new window.Notification('Revaluación pendiente', {
        body: describePendingItem(item),
        icon: logoImage,
        tag: `material-revaluation-${id}`,
        renotify: true,
      });

      notification.onclick = () => {
        window.focus();
        navigate('/revaluaciones');
        notification.close();
      };

      notifiedIdsRef.current.add(id);
    }

    persistNotifiedIds(notifiedIdsRef.current);
  }, [navigate]);

  const toggleNativeNotifications = async () => {
    if (nativeNotificationsEnabled) {
      setNativeNotificationsEnabled(false);
      window.localStorage.setItem(NOTIFICATIONS_ENABLED_KEY, 'false');
      return;
    }

    if (!canUseNativeNotifications()) {
      setNativeNotificationPermission('unsupported');
      toast.info(
        'Este navegador o conexion (HTTP) no permite avisos del navegador. Los avisos dentro de la app siguen activos.',
      );
      return;
    }

    try {
      const permission = await window.Notification.requestPermission();
      setNativeNotificationPermission(permission);

      if (permission === 'granted') {
        setNativeNotificationsEnabled(true);
        window.localStorage.setItem(NOTIFICATIONS_ENABLED_KEY, 'true');
        toast.success('Avisos del navegador activados.');
      } else if (permission === 'denied') {
        toast.error('El navegador bloqueo los avisos. Habilitelos desde la configuracion del sitio.');
      }
    } catch {
      setNativeNotificationPermission('unsupported');
    }
  };

  const fetchPendingCount = useCallback(async () => {
    try {
      const response = await apiFetch('/api/material-revaluations/pending');
      const json = await response.json();

      if (!response.ok || !json.success) return;

      const items = Array.isArray(json.data) ? json.data : [];
      const currentIds = new Set(items.map(getPendingId).filter(Boolean));
      const isFirstLoad = !hasLoadedPendingRef.current;
      const newItems = items.filter((item) => {
        const id = getPendingId(item);
        return id && !pendingIdsRef.current.has(id);
      });

      for (const notifiedId of Array.from(notifiedIdsRef.current)) {
        if (!currentIds.has(notifiedId)) {
          notifiedIdsRef.current.delete(notifiedId);
        }
      }
      persistNotifiedIds(notifiedIdsRef.current);

      setPendingRevaluations(items.length);

      if (!isFirstLoad && newItems.length > 0) {
        playAlertSound();
        toast.info(
          newItems.length === 1
            ? `Nueva revaluacion pendiente: ${describePendingItem(newItems[0])}`
            : `${newItems.length} nuevas revaluaciones pendientes`,
          {
            duration: 0,
            action: { label: 'Revisar', onClick: () => navigate('/revaluaciones') },
          },
        );
        showNativeNotification(newItems);
      }

      pendingIdsRef.current = currentIds;
      hasLoadedPendingRef.current = true;
    } catch {
      setPendingRevaluations(0);
    }
  }, [showNativeNotification, toast, navigate]);

  useEffect(() => {
    if (!sessionChecked) return undefined;

    if (!canAccessRevaluations) {
      setPendingRevaluations(0);
      pendingIdsRef.current = new Set();
      hasLoadedPendingRef.current = false;
      return undefined;
    }

    fetchPendingCount();
    const interval = window.setInterval(fetchPendingCount, PENDING_POLL_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [canAccessRevaluations, sessionChecked, fetchPendingCount]);

  useEffect(() => {
    if (!sessionChecked || !canAccessRevaluations) return undefined;
    if (typeof window.EventSource === 'undefined') return undefined;

    const source = new window.EventSource('/api/material-revaluations/stream');
    const timers = [];

    source.addEventListener('pending', () => {
      fetchPendingCount();
      timers.push(window.setTimeout(fetchPendingCount, 1500));
      timers.push(window.setTimeout(fetchPendingCount, 4000));
    });

    return () => {
      source.close();
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [sessionChecked, canAccessRevaluations, fetchPendingCount]);

  useEffect(() => {
    if (!sessionChecked || !canAccessRevaluations) return undefined;

    window.addEventListener(REVALUATIONS_UPDATED_EVENT, fetchPendingCount);

    return () => window.removeEventListener(REVALUATIONS_UPDATED_EVENT, fetchPendingCount);
  }, [sessionChecked, canAccessRevaluations, fetchPendingCount]);

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      navigate('/', { replace: true });
    }
  };

  return (
    <div className={`dashboard-layout ${isSidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <aside className={`sidebar ${isSidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <img src={logoImage} alt="Maderas Rivero Logo" className="sidebar-logo-img" />
          </div>
        </div>

        <nav className="sidebar-nav">
          <TreeView
            variant="sidebar"
            ariaLabel="Secciones del portal"
            expandedIds={expandedNodes}
            onExpandedChange={setExpandedNodes}
          >
            {/* Dashboard General y Registros son globales, no de un proceso, así
                que cuelgan de la raíz. Cuando existan sus versiones por proceso
                pasarán a ser hijas de cada rama. El perfil admin puro no los ve:
                su trabajo es Administración, y esos dos ítems son ruido para él. */}
            {!isAdminOnly && (
              <>
                <TreeItem id="dashboard" label="Dashboard General" icon={LayoutDashboard} to="/dashboard" />
                {/* Sin `end`: el detalle de una ejecución (/logs/:id) debe mantener
                    este nodo marcado como activo. */}
                <TreeItem id="registros" label="Registros" icon={List} to="/logs" end={false} />
              </>
            )}

            {canAccessRevaluations && (
              isRevaluacionesAuditor ? (
                <TreeItem
                  id="revaluaciones"
                  label="Revaluación"
                  icon={ClipboardCheck}
                  className="tree-section-start"
                  to="/auditoria/material_revaluation"
                />
              ) : (
                <TreeItem
                  id="revaluaciones"
                  label="Revaluación"
                  icon={ClipboardCheck}
                  className="tree-section-start"
                  // El contador va en la rama, no en la hoja: la rama se ve
                  // siempre, la hoja solo cuando está desplegada.
                  badge={pendingRevaluations > 0 ? pendingRevaluations : undefined}
                >
                  <TreeItem id="rev-listado" label="Revaluaciones" icon={ClipboardCheck} to="/revaluaciones" />
                </TreeItem>
              )
            )}

            {canAccessInternationalPurchases && (
              isComprasAuditor ? (
                <TreeItem id="compras" label="Compras Internacionales" icon={Ship} className="tree-section-start" to="/auditoria/international_purchases" />
              ) : (
                <TreeItem id="compras" label="Compras Internacionales" icon={Ship} className="tree-section-start">
                  <TreeItem id="com-embarques" label="Embarques" icon={Ship} to="/international-purchases" />
                  <TreeItem id="com-enlaces" label="Enlaces" icon={LinkIcon} to="/international-purchases/enlaces" />
                </TreeItem>
              )
            )}

            {canAccessAdmin && (
              <TreeItem id="administracion" label="Administración" icon={ShieldCheck} className="tree-section-start">
                <TreeItem id="adm-usuarios" label="Usuarios" icon={Users} to="/administracion/usuarios" />
                <TreeItem id="adm-permisos" label="Matriz de permisos" icon={Table2} to="/administracion/permisos" />
                <TreeItem id="adm-bitacora" label="Bitácora" icon={Activity} to="/administracion/bitacora" />
                <TreeItem id="adm-sesiones" label="Sesiones" icon={History} to="/administracion/sesiones" />
                <TreeItem id="adm-sistema" label="Sistema" icon={ServerCog} to="/administracion/sistema" />
              </TreeItem>
            )}
          </TreeView>
        </nav>

        <div className="sidebar-footer">
          <button
            type="button"
            className={`sidebar-toggle-btn ${isSidebarCollapsed ? 'collapsed' : ''}`}
            onClick={toggleSidebar}
            aria-label={isSidebarCollapsed ? 'Mostrar barra lateral' : 'Ocultar barra lateral'}
            title={isSidebarCollapsed ? 'Mostrar barra lateral' : 'Ocultar barra lateral'}
          >
            <ChevronLeft size={16} />
          </button>
        </div>
      </aside>

      <div className="content-area">
        <Topbar
          user={user}
          isDarkTheme={isDarkTheme}
          onToggleTheme={toggleTheme}
          showNotifications={canAccessRevaluations && nativeNotificationPermission !== 'unsupported'}
          notificationsActive={nativeActive}
          onToggleNotifications={toggleNativeNotifications}
          pendingCount={pendingRevaluations}
          onLogout={handleLogout}
        />

        <main className="main-content">
          <Outlet context={{ pendingRevaluations }} />
        </main>
      </div>

      <SessionExpiredModal />
    </div>
  );
}
