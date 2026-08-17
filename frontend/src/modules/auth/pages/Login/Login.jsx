import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, MotionConfig } from 'framer-motion';
import {
  Sun,
  Moon,
  User,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
} from 'lucide-react';
import { Input } from '@/shared/components/Input/Input';
import { Button } from '@/shared/components/Button/Button';
import { Alert } from '@/shared/components/Alert/Alert';
import { Modal, ModalFooter } from '@/shared/components/Modal/Modal';
import { apiFetch } from '@/shared/utils/apiClient';
import { formatRelativeTime } from '@/shared/utils/formatters';
import { useAuth } from '@/shared/context/useAuth';
import logo from '@/assets/logo_maderas_rivero_secundario.png';
import './Login.css';

// Página inicial de cada módulo, para el atajo de aterrizaje tras iniciar
// sesión. El admin puro aterriza en Administración: ya no ve el panel general
// en su menú, así que mandarlo ahí lo dejaría en una página que no puede navegar.
const HOME_BY_PROCESS = {
  material_revaluation: '/revaluaciones',
  international_purchases: '/international-purchases',
  admin: '/administracion',
};

// Destino guardado por ProtectedRoute al redirigir aquí una sesión caducada.
// Se exige que sea una ruta interna y que no sea el propio login, para no
// entrar en bucle. No se acepta nada que venga de la URL: solo del `state` del
// historial, que lo escribe el guard y no quien envía el enlace.
function getReturnPath(location) {
  const from = location.state?.from?.pathname;
  if (typeof from !== 'string') return null;
  if (!from.startsWith('/') || from.startsWith('//') || from === '/') return null;
  return `${from}${location.state.from.search || ''}`;
}

// El destino guardado por ProtectedRoute puede seguir en el `state` del historial
// cuando quien envia el formulario es una persona distinta a la que lo dejo ahi
// (p.ej. "Cerrar e iniciar nueva sesion" sobre una sesion activa). Sin esto, el
// nuevo usuario aterriza en el modulo de la sesion anterior aunque no tenga
// acceso, confiando en que cada pagina se proteja sola.
function isReturnPathAllowedForProcesses(path, processCodes) {
  for (const [processCode, homePath] of Object.entries(HOME_BY_PROCESS)) {
    if (path.startsWith(homePath) && !processCodes.includes(processCode)) {
      return false;
    }
  }
  if (path.startsWith('/administracion') && !processCodes.includes('admin')) {
    return false;
  }
  return true;
}

export function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { refresh } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSessionConflictOpen, setIsSessionConflictOpen] = useState(false);
  // Hora de la última actividad de la sesión que bloquea, en relativo. Sirve para
  // que el usuario reconozca si ese acceso es suyo o de alguien más.
  const [sessionConflictLastSeen, setSessionConflictLastSeen] = useState(null);
  const [isDarkTheme, setIsDarkTheme] = useState(
    () => document.documentElement.getAttribute('data-theme') === 'dark',
  );

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

  const handleLogin = async (replaceExistingSession = false) => {
    setError(null);
    setIsLoading(true);

    try {
      const response = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password, replaceExistingSession }),
      });

      const data = await response.json();

      if (response.status === 409 && data.code === 'SESSION_ALREADY_ACTIVE') {
        setSessionConflictLastSeen(
          data.lastSeenAt ? formatRelativeTime(data.lastSeenAt) : null,
        );
        setIsSessionConflictOpen(true);
        return;
      }

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Error al iniciar sesión');
      }

      const session = await refresh();
      if (replaceExistingSession) {
        try {
          window.localStorage.setItem('maderasRivero.session-replaced', String(Date.now()));
        } catch {}
      }
      // Quien solo tiene un módulo entra directo en él; quien tiene varios, al
      // panel general. Se deduce de los procesos de la sesión y no del nombre de
      // usuario: comparar nombres obligaba a tocar código para dar de alta a
      // alguien nuevo con los mismos permisos.
      const processes = session?.processes || [];
      const processCodes = processes.map((p) => p?.process_code).filter(Boolean);
      const landing =
        processes.length === 1
          ? HOME_BY_PROCESS[processes[0]?.process_code] ?? '/dashboard'
          : '/dashboard';

      // Si se llegó aquí por una sesión caducada, gana el sitio donde estaba el
      // usuario; el aterrizaje por proceso es para quien entra sin destino. Pero
      // solo si esta sesión (que puede ser de otro usuario) sí tiene acceso ahí.
      const returnPath = getReturnPath(location);
      const safeReturnPath =
        returnPath && isReturnPathAllowedForProcesses(returnPath, processCodes) ? returnPath : null;
      navigate(safeReturnPath ?? landing, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const onSubmit = (e) => {
    e.preventDefault();
    handleLogin();
  };

  return (
    <MotionConfig reducedMotion="user">
    <div className="login-page">
      <motion.div
        className="login-shell"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.4, 0, 0.2, 1] }}
      >
        <aside className="login-brand">
          <div className="login-brand-pattern" aria-hidden="true" />
          <div className="login-brand-top">
            <img src={logo} alt="Maderas y Derivados Rivero" className="login-brand-logo" />
          </div>

          <div className="login-brand-copy">
            <h2 className="login-brand-title">Módulo de Automatizaciones</h2>
          </div>

          <p className="login-brand-footer">© {new Date().getFullYear()} Maderas y Derivados Rivero</p>
        </aside>

        <div className="login-panel">
          <button
            type="button"
            className="login-theme-toggle"
            onClick={toggleTheme}
            aria-label={isDarkTheme ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            title={isDarkTheme ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          >
            {isDarkTheme ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          <div className="login-panel-inner">
            <motion.div
              className="login-panel-header"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1, ease: [0.4, 0, 0.2, 1] }}
            >
              <p className="login-eyebrow">Bienvenido</p>
              <h1 className="login-title">Inicia sesión</h1>
              <p className="login-subtitle">Ingresa tus credenciales para acceder al sistema.</p>
            </motion.div>

            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                  animate={{ opacity: 1, height: 'auto', marginBottom: 16 }}
                  exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                  transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                  style={{ overflow: 'hidden' }}
                >
                  <Alert variant="error" onDismiss={() => setError(null)}>
                    {error}
                  </Alert>
                </motion.div>
              )}
            </AnimatePresence>

            <motion.form
              className="login-form"
              onSubmit={onSubmit}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.18, ease: [0.4, 0, 0.2, 1] }}
            >
              <div className="login-field">
                <span className="login-field-icon" aria-hidden="true">
                  <User size={18} />
                </span>
                <Input
                  label="Usuario"
                  id="username"
                  type="text"
                  placeholder="Ingrese su usuario"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  disabled={isLoading}
                  className="login-input-with-icon"
                />
              </div>

              <div className="login-field login-field-password">
                <span className="login-field-icon" aria-hidden="true">
                  <Lock size={18} />
                </span>
                <Input
                  label="Contraseña"
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Ingrese su contraseña"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={isLoading}
                  className="login-input-with-icon"
                />
                <button
                  type="button"
                  className="login-toggle-password"
                  onClick={() => setShowPassword((v) => !v)}
                  disabled={isLoading}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  title={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>

              <div className="login-actions">
                <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
                  <Button
                    type="submit"
                    variant="primary"
                    className="login-submit-btn"
                    disabled={isLoading}
                    isLoading={isLoading}
                    rightIcon={!isLoading ? <ArrowRight size={18} /> : undefined}
                  >
                    {isLoading ? 'Iniciando sesión...' : 'Iniciar sesión'}
                  </Button>
                </motion.div>
              </div>
            </motion.form>
          </div>
        </div>
      </motion.div>

      <Modal
        isOpen={isSessionConflictOpen}
        onClose={() => setIsSessionConflictOpen(false)}
        title="Sesión activa detectada"
        subtitle="Esta cuenta ya tiene una sesión abierta en otro dispositivo o navegador."
        className="login-session-conflict-modal"
      >
        <p className="login-session-conflict-message">
          {sessionConflictLastSeen
            ? `La última actividad de esa sesión fue ${sessionConflictLastSeen}. `
            : ''}
          Si continúas, esa sesión se cerrará y se iniciará una nueva aquí. Si no
          reconoces ese acceso, cambia tu contraseña y avisa al administrador.
        </p>
        <ModalFooter>
          <div className="login-session-conflict-actions">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsSessionConflictOpen(false)}
              disabled={isLoading}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={() => {
                setIsSessionConflictOpen(false);
                handleLogin(true);
              }}
              disabled={isLoading}
            >
              Cerrar e iniciar nueva
            </Button>
          </div>
        </ModalFooter>
      </Modal>
    </div>
    </MotionConfig>
  );
}
