import React, { useCallback, useEffect, useState } from 'react';
import { Check, Copy, Link as LinkIcon, Plus, RotateCcw, Send, Ban } from 'lucide-react';

import { DataTable } from '@/shared/components/DataTable/DataTable';
import { Badge } from '@/shared/components/Badge/Badge';
import { Button } from '@/shared/components/Button/Button';
import { Alert } from '@/shared/components/Alert/Alert';
import { Modal, ModalFooter } from '@/shared/components/Modal/Modal';
import { Input } from '@/shared/components/Input/Input';
import { EmptyState } from '@/shared/components/EmptyState/EmptyState';
import { Hint } from '@/shared/components/Hint/Hint';
import { PageHeader } from '@/shared/components/PageHeader/PageHeader';
import { ProcessGuard } from '@/shared/components/ProcessGuard/ProcessGuard';
import { useToast } from '@/shared/components/Toast/useToast';
import { apiFetch } from '@/shared/utils/apiClient';
import { formatDateTime, formatRelativeTime } from '@/shared/utils/formatters';

import './ShipmentInvites.css';

const INTERNATIONAL_PURCHASES_PROCESS = 'international_purchases';

const STATUS_VARIANT = {
  ACTIVE: 'success',
  DORMANT: 'warning',
  REVOKED: 'error',
};

const STATUS_LABEL = {
  ACTIVE: 'Activo',
  DORMANT: 'Inactivo',
  REVOKED: 'Revocado',
};

function ShipmentInvitesContent() {
  const toast = useToast();

  const [invites, setInvites] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formValues, setFormValues] = useState({ forwarderName: '', recipientEmail: '' });
  const [formErrors, setFormErrors] = useState([]);
  const [isSaving, setIsSaving] = useState(false);

  // Resultado de la emision: es lo unico que contiene el enlace en claro.
  const [issued, setIssued] = useState(null);
  const [copied, setCopied] = useState(false);

  const [confirmTarget, setConfirmTarget] = useState(null);

  const loadInvites = useCallback(async () => {
    setLoadError(false);

    try {
      const response = await apiFetch('/api/international-purchases/invites');
      const json = await response.json();

      if (!response.ok || !json?.success) {
        setLoadError(true);
        return;
      }

      setInvites(Array.isArray(json.data) ? json.data : []);
    } catch {
      setLoadError(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInvites();
  }, [loadInvites]);

  const handleIssue = async (event) => {
    event.preventDefault();
    setIsSaving(true);
    setFormErrors([]);

    try {
      const response = await apiFetch('/api/international-purchases/invites', {
        method: 'POST',
        body: JSON.stringify(formValues),
      });
      const json = await response.json();

      if (!response.ok || !json?.success) {
        setFormErrors(
          Array.isArray(json?.errors) && json.errors.length > 0
            ? json.errors
            : [json?.message || 'No se pudo emitir el enlace.'],
        );
        return;
      }

      setIsFormOpen(false);
      setFormValues({ forwarderName: '', recipientEmail: '' });
      setIssued({ ...json.data, notified: json.notified, message: json.message });
      setCopied(false);
      loadInvites();
    } catch {
      setFormErrors(['No se pudo contactar con el servidor.']);
    } finally {
      setIsSaving(false);
    }
  };

  const runAction = async (invite, action) => {
    setBusyId(invite.invite_id);

    try {
      const response = await apiFetch(
        `/api/international-purchases/invites/${invite.invite_id}/${action}`,
        { method: 'POST' },
      );
      const json = await response.json();

      if (!response.ok || !json?.success) {
        // Duracion 0 = no se cierra solo. Un fallo aqui suele necesitar una
        // decision (regenerar en vez de reactivar), y `toast.error` dura 3 s.
        toast.error(json?.message || 'No se pudo completar la operación.', { duration: 0 });
        return;
      }

      // Regenerar devuelve un enlace nuevo en claro: mismo modal que la emision.
      if (action === 'regenerate') {
        setIssued({ ...json.data, notified: json.notified, message: json.message });
        setCopied(false);
      } else {
        toast.success(json.message);
      }

      loadInvites();
    } catch {
      toast.error('No se pudo contactar con el servidor.', { duration: 0 });
    } finally {
      setBusyId(null);
      setConfirmTarget(null);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(issued.registrationUrl);
      setCopied(true);
    } catch {
      // clipboard exige contexto seguro: en http:// sin localhost no existe.
      // El enlace ya esta a la vista y es seleccionable, asi que se avisa y ya.
      toast.error('El navegador no permitió copiar. Seleccione el enlace y cópielo a mano.', {
        duration: 0,
      });
    }
  };

  const columns = [
    {
      header: 'Forwarder',
      accessor: 'forwarder_name',
      cell: (row) => (
        <div className="invite-forwarder">
          <strong>{row.forwarder_name}</strong>
          <span className="muted-text">{row.recipient_email}</span>
        </div>
      ),
    },
    {
      header: 'Estado',
      cell: (row) => (
        <Badge variant={STATUS_VARIANT[row.status] || 'default'} size="sm">
          {STATUS_LABEL[row.status] || row.status}
        </Badge>
      ),
    },
    {
      header: (
        <span className="invite-header-hint">
          Último uso
          <Hint
            text="Un enlace sin usar durante 18 meses queda inactivo por seguridad. Se reactiva con un clic."
            position="bottom"
          />
        </span>
      ),
      cell: (row) =>
        row.last_used_at ? (
          <span title={formatDateTime(row.last_used_at)}>{formatRelativeTime(row.last_used_at)}</span>
        ) : (
          <span className="muted-text">Nunca</span>
        ),
    },
    {
      header: 'Envíos',
      cell: (row) => <span className="data-text">{row.submission_count}</span>,
    },
    {
      header: 'Emitido',
      cell: (row) => (
        <span className="muted-text" title={formatDateTime(row.created_at)}>
          {formatRelativeTime(row.created_at)} · {row.created_by}
        </span>
      ),
    },
    {
      header: 'Acciones',
      cell: (row) => {
        const isBusy = busyId === row.invite_id;

        return (
          <div className="invite-actions">
            {row.status === 'ACTIVE' && (
              <Button
                variant="ghost"
                disabled={isBusy}
                onClick={() => setConfirmTarget({ invite: row, action: 'revoke' })}
                leftIcon={<Ban size={14} aria-hidden="true" />}
              >
                Revocar
              </Button>
            )}

            {row.status === 'DORMANT' && (
              <Button
                variant="ghost"
                disabled={isBusy}
                onClick={() => runAction(row, 'reactivate')}
                leftIcon={<RotateCcw size={14} aria-hidden="true" />}
              >
                Reactivar
              </Button>
            )}

            {/* Regenerar no se ofrece sobre un enlace ya sustituido: el backend
                responde 409 y hay que actuar sobre el vigente. */}
            {!row.replaced_by_invite_id && (
              <Button
                variant="ghost"
                disabled={isBusy}
                onClick={() => setConfirmTarget({ invite: row, action: 'regenerate' })}
                leftIcon={<Send size={14} aria-hidden="true" />}
              >
                Regenerar
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="shipment-invites-page">
      <PageHeader
        title="Enlaces de registro"
        subtitle="Enlaces permanentes entregados a los forwarders para que registren embarques."
        actions={
          <Button
            variant="primary"
            onClick={() => {
              setFormErrors([]);
              setIsFormOpen(true);
            }}
            leftIcon={<Plus size={16} aria-hidden="true" />}
          >
            Emitir enlace
          </Button>
        }
      />

      {/* El fallo de carga no puede llevarse por delante la cabecera: sin ella la
          pantalla pierde el titulo y la accion de emitir, que sigue siendo
          valida aunque el listado no haya cargado. */}
      {loadError ? (
        <EmptyState
          icon={LinkIcon}
          tone="error"
          title="No se pudieron cargar los enlaces"
          description="Ocurrió un problema al consultar los enlaces de registro."
          action={{ label: 'Reintentar', onClick: loadInvites }}
        />
      ) : (
        <>
          <p className="invite-intro">
            Cada forwarder recibe un enlace permanente para registrar sus embarques sin cuenta
            en el sistema. El enlace se muestra <strong>una sola vez</strong> al emitirlo.
          </p>

          {/* Sin `onRowClick`: cada fila lleva sus propios botones de accion y
              DataTable no detiene la propagacion en las celdas normales, asi que
              pulsar "Revocar" dispararia tambien el handler de la fila. */}
          <DataTable
            columns={columns}
            data={invites}
            isLoading={isLoading}
            skeletonRows={4}
            emptyMessage="Todavía no se ha emitido ningún enlace de registro."
          />
        </>
      )}

      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title="Emitir enlace de registro"
        subtitle="Se enviará por correo al destinatario. El enlace no caduca, pero se puede revocar en cualquier momento."
        className="modal-sm"
      >
        <form onSubmit={handleIssue}>
          {formErrors.length > 0 && (
            <Alert variant="error" title="Revise los datos">
              <ul className="invite-errors">
                {formErrors.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            </Alert>
          )}

          <Input
            id="invite-forwarder-name"
            label="Nombre del forwarder"
            autoComplete="off"
            placeholder="Ej. Transportes del Pacífico"
            value={formValues.forwarderName}
            onChange={(e) => setFormValues((prev) => ({ ...prev, forwarderName: e.target.value }))}
          />

          <Input
            id="invite-recipient-email"
            label="Correo del destinatario"
            type="email"
            autoComplete="off"
            placeholder="Ej. operaciones@forwarder.com"
            value={formValues.recipientEmail}
            onChange={(e) => setFormValues((prev) => ({ ...prev, recipientEmail: e.target.value }))}
          />

          <ModalFooter>
            <Button type="button" variant="secondary" onClick={() => setIsFormOpen(false)} disabled={isSaving}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" isLoading={isSaving} disabled={isSaving}>
              Emitir enlace
            </Button>
          </ModalFooter>
        </form>
      </Modal>

      <Modal
        isOpen={Boolean(issued)}
        onClose={() => setIssued(null)}
        title="Enlace emitido"
        subtitle={`Para ${issued?.forwarder_name || ''}`}
      >
        <Alert variant={issued?.notified ? 'success' : 'warning'} title={
          issued?.notified ? 'Enviado por correo' : 'No se pudo enviar por correo'
        }>
          {issued?.message}
        </Alert>

        <Alert variant="warning" title="Cópielo ahora">
          Este enlace no se vuelve a mostrar: el sistema solo guarda su huella cifrada. Si lo
          pierde, tendrá que regenerarlo.
        </Alert>

        <div className="invite-link-box">
          <code className="invite-link">{issued?.registrationUrl}</code>
          <Button
            type="button"
            variant={copied ? 'secondary' : 'primary'}
            onClick={copyLink}
            leftIcon={copied
              ? <Check size={16} aria-hidden="true" />
              : <Copy size={16} aria-hidden="true" />}
          >
            {copied ? 'Copiado' : 'Copiar enlace'}
          </Button>
        </div>

        <ModalFooter>
          <Button type="button" variant="secondary" onClick={() => setIssued(null)}>
            Ya lo copié
          </Button>
        </ModalFooter>
      </Modal>

      <Modal
        isOpen={Boolean(confirmTarget)}
        onClose={() => setConfirmTarget(null)}
        title={confirmTarget?.action === 'revoke' ? 'Revocar enlace' : 'Regenerar enlace'}
        className="modal-sm"
      >
        <p className="invite-confirm">
          {confirmTarget?.action === 'revoke' ? (
            <>
              El enlace de <strong>{confirmTarget?.invite.forwarder_name}</strong> dejará de
              funcionar de inmediato. Los embarques ya registrados no se tocan.
            </>
          ) : (
            <>
              Se emitirá un enlace nuevo para{' '}
              <strong>{confirmTarget?.invite.forwarder_name}</strong> y el actual quedará
              revocado. Habrá que entregarle el nuevo.
            </>
          )}
        </p>

        <ModalFooter>
          <Button type="button" variant="secondary" onClick={() => setConfirmTarget(null)}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant={confirmTarget?.action === 'revoke' ? 'danger' : 'primary'}
            isLoading={busyId === confirmTarget?.invite.invite_id}
            onClick={() => runAction(confirmTarget.invite, confirmTarget.action)}
          >
            {confirmTarget?.action === 'revoke' ? 'Revocar' : 'Regenerar'}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}

/**
 * ShipmentInvites — Inventario de enlaces de registro entregados a los forwarders.
 *
 * Subseccion propia de Compras Internacionales (`/international-purchases/enlaces`).
 * Antes era el componente `InvitesPanel`, montado en una pestaña de la pagina de
 * embarques: se independizo porque no es otra vista de los embarques sino otra
 * tarea, con sus propios datos y acciones, y porque el resto del proyecto
 * resuelve las subsecciones con rutas hermanas (ver los cinco de `/pagos`).
 *
 * Solo aplica el gate de proceso; el contenido vive en `ShipmentInvitesContent`
 * y no se monta hasta confirmarlo. Al salir de la pagina de embarques dejo de
 * heredar el `ProcessGuard` de aquella, asi que lo lleva propio.
 *
 * El enlace en claro solo existe en la respuesta de emision y de regeneracion:
 * la base guarda unicamente su SHA-256. Por eso el modal de resultado insiste
 * en copiarlo y no hay forma de volver a consultarlo despues.
 */
export function ShipmentInvites() {
  return (
    <ProcessGuard
      processCode={INTERNATIONAL_PURCHASES_PROCESS}
      moduleName="Compras Internacionales"
    >
      <ShipmentInvitesContent />
    </ProcessGuard>
  );
}
