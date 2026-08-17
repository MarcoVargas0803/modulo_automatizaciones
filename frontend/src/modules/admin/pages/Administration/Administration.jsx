import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Activity,
  Download,
  History,
  LogOut,
  Pencil,
  Search,
  ServerCog,
  ShieldCheck,
  UserPlus,
} from 'lucide-react';
import { Alert } from '@/shared/components/Alert/Alert';
import { Badge } from '@/shared/components/Badge/Badge';
import { Button } from '@/shared/components/Button/Button';
import { EmptyState } from '@/shared/components/EmptyState/EmptyState';
import { Input } from '@/shared/components/Input/Input';
import { Modal, ModalFooter } from '@/shared/components/Modal/Modal';
import { PageHeader } from '@/shared/components/PageHeader/PageHeader';
import { Select } from '@/shared/components/Select/Select';
import { useToast } from '@/shared/components/Toast/useToast';
import { useAuth } from '@/shared/context/useAuth';
import { useAdminApi } from '@/modules/admin/hooks/useAdminApi';
import { apiFetch } from '@/shared/utils/apiClient';
import './Administration.css';

const TAB_IDS = ['usuarios', 'permisos', 'bitacora', 'sesiones', 'sistema'];

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
}

function emptyAccessDraft(processes) {
  return processes.reduce((draft, process) => {
    draft[process.process_code] = { enabled: false, role: '', canExport: false };
    return draft;
  }, {});
}

function accessDraftFromUser(user, processes) {
  const draft = emptyAccessDraft(processes);

  for (const entry of user?.access || []) {
    if (!draft[entry.process_code]) continue;
    draft[entry.process_code] = {
      enabled: true,
      role: entry.role || '',
      canExport: entry.can_export === true,
    };
  }

  return draft;
}

function draftToPayload(draft) {
  return Object.entries(draft)
    .filter(([, value]) => value.enabled)
    .map(([processCode, value]) => ({
      process_code: processCode,
      role: value.role || null,
      can_view: true,
      can_export: value.canExport,
    }));
}

function AccessEditor({ processes, draft, onChange }) {
  return (
    <div className="admin-access-grid">
      {processes.map((process) => {
        const value = draft[process.process_code] || { enabled: false, role: '', canExport: false };
        const roles = process.valid_roles || null;

        return (
          <div
            key={process.process_code}
            className={`admin-access-row ${value.enabled ? 'is-enabled' : ''}`}
          >
            <label className="admin-access-check">
              <input
                type="checkbox"
                checked={value.enabled}
                onChange={(event) =>
                  onChange(process.process_code, { ...value, enabled: event.target.checked })
                }
              />
              <span>{process.process_name}</span>
              {!process.is_active && <Badge variant="warning" size="sm">inactivo</Badge>}
            </label>

            {value.enabled && (
              <div className="admin-access-options">
                {roles && (
                  <Select
                    id={`role-${process.process_code}`}
                    aria-label={`Perfil en ${process.process_name}`}
                    placeholder="Selecciona un perfil"
                    value={value.role}
                    options={roles.map((role) => ({ value: role, label: role }))}
                    onChange={(event) =>
                      onChange(process.process_code, { ...value, role: event.target.value })
                    }
                  />
                )}
                <label className="admin-access-check admin-access-export">
                  <input
                    type="checkbox"
                    checked={value.canExport}
                    onChange={(event) =>
                      onChange(process.process_code, { ...value, canExport: event.target.checked })
                    }
                  />
                  <span>Puede exportar</span>
                </label>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function Administration() {
  const api = useAdminApi();
  const toast = useToast();
  const { tab: tabParam } = useParams();
  const { user: sessionUser, refresh } = useAuth();

  const tab = TAB_IDS.includes(tabParam) ? tabParam : 'usuarios';
  const [users, setUsers] = useState([]);
  const [processes, setProcesses] = useState([]);
  const [activity, setActivity] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [health, setHealth] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [form, setForm] = useState({ username: '', display_name: '', email: '', password: '', password_confirm: '' });
  const [accessDraft, setAccessDraft] = useState({});
  const [formError, setFormError] = useState('');
  // Desactivar (no activar) pide confirmación: saca a alguien del sistema o le corta
  // el proceso a todos sus usuarios de un clic. { kind: 'user' | 'process', item }
  const [confirmDeactivate, setConfirmDeactivate] = useState(null);
  const [isDeactivating, setIsDeactivating] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [isExportingActivity, setIsExportingActivity] = useState(false);

  const loadCore = useCallback(async () => {
    setIsLoading(true);
    const [usersResult, processesResult] = await Promise.all([api.getUsers(), api.getProcesses()]);

    if (!usersResult.success || !processesResult.success) {
      setLoadError(usersResult.message || processesResult.message);
    } else {
      setLoadError('');
      setUsers(usersResult.data || []);
      setProcesses(processesResult.data || []);
    }

    setIsLoading(false);
  }, [api]);

  useEffect(() => {
    loadCore();
  }, [loadCore]);

  const loadActivity = useCallback(async () => {
    const result = await api.getActivity();
    if (result.success) setActivity(result.data || []);
    else toast.error(result.message, { duration: 0 });
  }, [api, toast]);

  const loadSessions = useCallback(async () => {
    const result = await api.getActivity({ action: 'auth.' });
    if (result.success) setSessions(result.data || []);
    else toast.error(result.message, { duration: 0 });
  }, [api, toast]);

  const exportActivity = async () => {
    setIsExportingActivity(true);
    try {
      const response = await apiFetch('/api/admin/activity/export.csv');
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message || 'No se pudo exportar la bitácora.');
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `bitacora_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error.message, { duration: 0 });
    } finally {
      setIsExportingActivity(false);
    }
  };

  const loadHealth = useCallback(async () => {
    const result = await api.getHealth();
    if (result.success) setHealth(result.data);
    else toast.error(result.message, { duration: 0 });
  }, [api, toast]);

  useEffect(() => {
    if (tab === 'bitacora') loadActivity();
    if (tab === 'sesiones') loadSessions();
    if (tab === 'sistema') loadHealth();
  }, [tab, loadActivity, loadSessions, loadHealth]);

  const activeProcesses = useMemo(
    () => processes.filter((process) => process.is_active),
    [processes],
  );

  const filteredUsers = useMemo(() => {
    const term = userSearch.trim().toLowerCase();
    if (!term) return users;
    return users.filter((user) =>
      [user.username, user.display_name, user.email]
        .some((value) => (value || '').toLowerCase().includes(term)));
  }, [users, userSearch]);

  // Cuantos usuarios activos podrían entrar a Administración a arreglar las cosas si
  // algo sale mal. Con 0 o 1, cualquier bloqueo de esa sola cuenta deja al portal sin
  // quien lo administre.
  const activeAdminCount = useMemo(
    () => users.filter((user) =>
      user.is_active && (user.access || []).some((entry) => entry.process_code === 'admin')).length,
    [users],
  );

  const openCreate = () => {
    setForm({ username: '', display_name: '', email: '', password: '', password_confirm: '' });
    setAccessDraft(emptyAccessDraft(activeProcesses));
    setFormError('');
    setCreateOpen(true);
  };

  const openEdit = (user) => {
    setForm({ username: user.username, display_name: user.display_name, email: user.email || '', password: '' });
    setAccessDraft(accessDraftFromUser(user, processes));
    setFormError('');
    setEditUser(user);
  };

  const changeAccess = (processCode, value) =>
    setAccessDraft((current) => ({ ...current, [processCode]: value }));

  const submitCreate = async () => {
    setFormError('');

    if (form.password !== form.password_confirm) {
      setFormError('Las contraseñas no coinciden');
      return;
    }

    setIsSaving(true);

    const result = await api.createUser({
      username: form.username,
      display_name: form.display_name,
      email: form.email || null,
      password: form.password,
      access: draftToPayload(accessDraft),
    });

    setIsSaving(false);

    if (!result.success) {
      setFormError(result.message);
      return;
    }

    toast.success(`Usuario ${form.username} creado`);
    setCreateOpen(false);
    await loadCore();
  };

  const submitEdit = async () => {
    setFormError('');
    setIsSaving(true);

    const profile = await api.updateUser(editUser.user_id, {
      display_name: form.display_name,
      email: form.email || null,
    });

    if (!profile.success) {
      setIsSaving(false);
      setFormError(profile.message);
      return;
    }

    const access = await api.updateAccess(editUser.user_id, draftToPayload(accessDraft));
    setIsSaving(false);

    if (!access.success) {
      setFormError(access.message);
      return;
    }

    toast.success(`Usuario ${editUser.username} actualizado`);
    setEditUser(null);
    await loadCore();

    // Si el administrador se edito a si mismo, el menu lateral debe reflejarlo.
    if (String(editUser.user_id) === String(sessionUser?.userId)) await refresh();
  };

  const toggleActive = async (user) => {
    // Activar es de bajo riesgo (le devuelve acceso a alguien) y no pide confirmación;
    // desactivar sí, porque lo saca del sistema de inmediato.
    if (user.is_active) {
      setConfirmDeactivate({ kind: 'user', item: user });
      return;
    }

    const result = await api.updateUser(user.user_id, { is_active: true });

    if (!result.success) {
      toast.error(result.message, { duration: 0 });
      return;
    }

    toast.success(`${user.username} activado`);
    await loadCore();
  };

  // Cerrar la sesión de otro no le quita el acceso: puede volver a entrar en
  // cuanto quiera. Por eso no pide confirmación, a diferencia de desactivar.
  const logoutUser = async (user) => {
    const result = await api.logoutUser(user.user_id);

    if (!result.success) {
      toast.error(result.message, { duration: 0 });
      return;
    }

    // El backend distingue "cerré una sesión" de "no había ninguna": decir
    // "sesión cerrada" cuando no había nada abierto haría creer al administrador
    // que expulsó a alguien.
    toast.success(result.message);
  };

  const toggleProcess = async (process) => {
    if (process.is_active) {
      setConfirmDeactivate({ kind: 'process', item: process });
      return;
    }

    const result = await api.setProcessActive(process.process_code, true);

    if (!result.success) {
      toast.error(result.message, { duration: 0 });
      return;
    }

    toast.success(`Proceso ${process.process_name} activado`);
    await loadCore();
  };

  const confirmDeactivateAction = async () => {
    if (!confirmDeactivate) return;
    setIsDeactivating(true);

    const result = confirmDeactivate.kind === 'user'
      ? await api.updateUser(confirmDeactivate.item.user_id, { is_active: false })
      : await api.setProcessActive(confirmDeactivate.item.process_code, false);

    setIsDeactivating(false);

    if (!result.success) {
      toast.error(result.message, { duration: 0 });
      return;
    }

    toast.success(
      confirmDeactivate.kind === 'user'
        ? `${confirmDeactivate.item.username} desactivado`
        : `Proceso ${confirmDeactivate.item.process_name} desactivado`,
    );
    setConfirmDeactivate(null);
    await loadCore();
  };

  if (isLoading) {
    return (
      <div className="admin-page">
        <p className="muted-text">Cargando el módulo de administración…</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="admin-page">
        <Alert variant="error" title="No se pudo cargar la administración">{loadError}</Alert>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <PageHeader
        title="Administración"
        actions={
          tab === 'usuarios' ? (
            <Button leftIcon={<UserPlus size={16} />} onClick={openCreate}>
              Nuevo usuario
            </Button>
          ) : null
        }
      />

      {activeAdminCount <= 1 && (
        <Alert variant="warning" title="Solo un administrador puede entrar a esta pantalla">
          {activeAdminCount === 0
            ? 'Ningún usuario activo tiene acceso al proceso "admin". Si nadie puede entrar aquí, nadie podrá arreglarlo.'
            : 'Solo un usuario activo tiene acceso al proceso "admin". Si esa cuenta se bloquea, nadie más puede entrar a esta pantalla para arreglarlo.'}
        </Alert>
      )}

      {tab === 'usuarios' && (
        <div className="admin-card">
          <label className="admin-user-search">
            <Search size={16} aria-hidden="true" />
            <input
              type="search"
              placeholder="Buscar por usuario, nombre o correo"
              value={userSearch}
              onChange={(event) => setUserSearch(event.target.value)}
              aria-label="Buscar usuarios"
            />
          </label>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Nombre</th>
                <th>Accesos</th>
                <th>Estado</th>
                <th>Último acceso</th>
                <th aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => (
                <tr key={user.user_id} className={user.is_active ? '' : 'is-inactive'}>
                  <td className="admin-mono">{user.username}</td>
                  <td>
                    {user.display_name}
                    {user.email && <span className="admin-subtext">{user.email}</span>}
                  </td>
                  <td>
                    <div className="admin-badges">
                      {(user.access || []).length === 0 && <span className="admin-subtext">Sin accesos</span>}
                      {(user.access || []).map((entry) => (
                        <Badge key={entry.process_code} variant="info" size="sm">
                          {entry.process_name}
                          {entry.role ? ` · ${entry.role}` : ''}
                          {entry.can_export ? ' · export' : ''}
                        </Badge>
                      ))}
                    </div>
                  </td>
                  <td>
                    <Badge variant={user.is_active ? 'success' : 'default'} size="sm">
                      {user.is_active ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </td>
                  <td className="admin-mono admin-subtext">
                    {user.last_login_at ? formatDateTime(user.last_login_at) : 'Nunca'}
                  </td>
                  <td>
                    <div className="admin-row-actions">
                      <Button variant="ghost" onClick={() => openEdit(user)} leftIcon={<Pencil size={14} />}>
                        Editar
                      </Button>
                      {user.is_active && (
                        <Button
                          variant="ghost"
                          onClick={() => logoutUser(user)}
                          leftIcon={<LogOut size={14} />}
                        >
                          Cerrar sesión
                        </Button>
                      )}
                      <Button
                        variant={user.is_active ? 'danger' : 'secondary'}
                        onClick={() => toggleActive(user)}
                      >
                        {user.is_active ? 'Desactivar' : 'Activar'}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={6} className="admin-subtext">
                    Ningún usuario coincide con "{userSearch}".
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'permisos' && (
        <div className="admin-card">
          <p className="admin-subtext">
            Quién puede ver (✓) o exportar (<strong>E</strong>) cada proceso, de un vistazo.
          </p>
          <div className="admin-table-wrap">
            <table className="admin-table admin-matrix">
              <thead>
                <tr>
                  <th>Usuario</th>
                  {activeProcesses.map((process) => (
                    <th key={process.process_code}>{process.process_name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.user_id} className={user.is_active ? '' : 'is-inactive'}>
                    <td className="admin-mono">{user.username}</td>
                    {activeProcesses.map((process) => {
                      const entry = (user.access || []).find(
                        (access) => access.process_code === process.process_code,
                      );
                      return (
                        <td key={process.process_code} className="admin-matrix-cell">
                          {entry ? (
                            <span title={entry.role ? `Perfil: ${entry.role}` : undefined}>
                              ✓{entry.can_export ? ' E' : ''}
                            </span>
                          ) : (
                            <span className="admin-subtext">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'bitacora' && (
        <div className="admin-card">
          <div className="admin-log-toolbar">
            <Button
              variant="secondary"
              onClick={exportActivity}
              isLoading={isExportingActivity}
              leftIcon={<Download size={16} />}
            >
              Exportar CSV
            </Button>
          </div>

          {activity.length === 0 ? (
            <EmptyState
              icon={Activity}
              title="Sin registros"
              description="No hay acciones que coincidan con los filtros."
            />
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Quién</th>
                  <th>Acción</th>
                  <th>Entidad</th>
                  <th>Origen</th>
                </tr>
              </thead>
              <tbody>
                {activity.map((row) => (
                  <tr key={row.activity_id}>
                    <td className="admin-mono">{formatDateTime(row.created_at)}</td>
                    <td>{row.username || <span className="admin-subtext">sin sesión</span>}</td>
                    <td className="admin-mono">{row.action}</td>
                    <td className="admin-subtext">
                      {row.entity_type ? `${row.entity_type} ${row.entity_id ?? ''}` : '—'}
                    </td>
                    <td className="admin-mono admin-subtext">{row.ip || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'sesiones' && (
        <div className="admin-card">
          {sessions.length === 0 ? (
            <EmptyState
              icon={History}
              title="Sin sesiones registradas"
              description="Aún no hay inicios ni cierres de sesión de usuarios."
            />
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Usuario</th>
                  <th>Evento</th>
                  <th>Origen</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((row) => (
                  <tr key={row.activity_id}>
                    <td className="admin-mono">{formatDateTime(row.created_at)}</td>
                    <td>{row.username || <span className="admin-subtext">—</span>}</td>
                    <td>
                      <Badge variant={row.action === 'auth.login' ? 'success' : 'default'} size="sm">
                        {row.action === 'auth.login' ? 'Inicio de sesión' : 'Cierre de sesión'}
                      </Badge>
                    </td>
                    <td className="admin-mono admin-subtext">{row.ip || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'sistema' && (
        <div className="admin-system">
          <div className="admin-card">
            <h2 className="admin-card-title"><ShieldCheck size={18} /> Procesos</h2>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Proceso</th>
                  <th>Usuarios</th>
                  <th>Estado</th>
                  <th aria-label="Acciones" />
                </tr>
              </thead>
              <tbody>
                {processes.map((process) => (
                  <tr key={process.process_code}>
                    <td>
                      {process.process_name}
                      <span className="admin-subtext admin-mono">{process.process_code}</span>
                    </td>
                    <td>{process.user_count}</td>
                    <td>
                      <Badge variant={process.is_active ? 'success' : 'default'} size="sm">
                        {process.is_active ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </td>
                    <td>
                      <Button
                        variant={process.is_active ? 'danger' : 'secondary'}
                        onClick={() => toggleProcess(process)}
                        disabled={process.process_code === 'admin'}
                      >
                        {process.is_active ? 'Desactivar' : 'Activar'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {health && (
            <div className="admin-card">
              <h2 className="admin-card-title"><ServerCog size={18} /> Salud</h2>
              <dl className="admin-health">
                <div>
                  <dt>Entorno</dt>
                  <dd className="admin-mono">{health.environment}</dd>
                </div>
                <div>
                  <dt>Tiempo encendido</dt>
                  <dd className="admin-mono">{Math.floor(health.uptimeSeconds / 60)} min</dd>
                </div>
                <div>
                  <dt>Base de datos</dt>
                  <dd>
                    <Badge variant={health.database.ok ? 'success' : 'error'} size="sm">
                      {health.database.ok ? 'Conectada' : 'Sin conexión'}
                    </Badge>
                    {health.database.version && (
                      <span className="admin-subtext">{health.database.version}</span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Usuarios activos</dt>
                  <dd className="admin-mono">{health.counters.usuarios_activos ?? '—'}</dd>
                </div>
                <div>
                  <dt>Eventos en bitácora</dt>
                  <dd className="admin-mono">{health.counters.eventos_bitacora ?? '—'}</dd>
                </div>
                <div>
                  <dt>Webhooks n8n</dt>
                  <dd>
                    <div className="admin-badges">
                      {Object.entries(health.webhooks).map(([name, configured]) => (
                        <Badge key={name} variant={configured ? 'success' : 'default'} size="sm">
                          {name}
                        </Badge>
                      ))}
                    </div>
                  </dd>
                </div>
              </dl>
            </div>
          )}
        </div>
      )}

      <Modal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Nuevo usuario"
        subtitle="Se crea activo y con los accesos que marques"
      >
        {formError && <Alert variant="error">{formError}</Alert>}
        <Input
          id="nuevo-username"
          label="Usuario"
          placeholder="nombre_apellido"
          value={form.username}
          onChange={(event) => setForm({ ...form, username: event.target.value })}
        />
        <Input
          id="nuevo-nombre"
          label="Nombre para mostrar"
          value={form.display_name}
          onChange={(event) => setForm({ ...form, display_name: event.target.value })}
        />
        <Input
          id="nuevo-email"
          label="Correo (opcional)"
          type="email"
          value={form.email}
          onChange={(event) => setForm({ ...form, email: event.target.value })}
        />
        <Input
          id="nuevo-password"
          label="Contraseña (mínimo 10 caracteres)"
          type="password"
          value={form.password}
          onChange={(event) => setForm({ ...form, password: event.target.value })}
        />
        <Input
          id="nuevo-password-confirm"
          label="Confirmar contraseña"
          type="password"
          value={form.password_confirm}
          onChange={(event) => setForm({ ...form, password_confirm: event.target.value })}
        />
        <AccessEditor processes={activeProcesses} draft={accessDraft} onChange={changeAccess} />
        <ModalFooter>
          <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancelar</Button>
          <Button onClick={submitCreate} isLoading={isSaving}>Crear usuario</Button>
        </ModalFooter>
      </Modal>

      <Modal
        isOpen={Boolean(editUser)}
        onClose={() => setEditUser(null)}
        title={`Editar ${editUser?.username || ''}`}
        subtitle="El nombre de usuario no se puede cambiar"
      >
        {formError && <Alert variant="error">{formError}</Alert>}
        <Input
          id="editar-nombre"
          label="Nombre para mostrar"
          value={form.display_name}
          onChange={(event) => setForm({ ...form, display_name: event.target.value })}
        />
        <Input
          id="editar-email"
          label="Correo"
          type="email"
          value={form.email}
          onChange={(event) => setForm({ ...form, email: event.target.value })}
        />
        <AccessEditor processes={processes} draft={accessDraft} onChange={changeAccess} />
        <ModalFooter>
          <Button variant="secondary" onClick={() => setEditUser(null)}>Cancelar</Button>
          <Button onClick={submitEdit} isLoading={isSaving}>Guardar</Button>
        </ModalFooter>
      </Modal>

      <Modal
        isOpen={Boolean(confirmDeactivate)}
        onClose={() => setConfirmDeactivate(null)}
        title="Confirmar desactivación"
      >
        <p>
          {confirmDeactivate?.kind === 'user' ? (
            <>
              ¿Seguro que deseas desactivar a{' '}
              <strong>{confirmDeactivate.item.display_name || confirmDeactivate.item.username}</strong>?
              Perderá acceso al portal de inmediato.
            </>
          ) : (
            <>
              ¿Seguro que deseas desactivar el proceso{' '}
              <strong>{confirmDeactivate?.item.process_name}</strong>? Todos los usuarios con acceso a
              él lo perderán de inmediato.
            </>
          )}
        </p>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setConfirmDeactivate(null)} disabled={isDeactivating}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={confirmDeactivateAction} isLoading={isDeactivating}>
            Desactivar
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
