import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Ship } from 'lucide-react';

import { Alert } from '@/shared/components/Alert/Alert';
import { Button } from '@/shared/components/Button/Button';
import { EmptyState } from '@/shared/components/EmptyState/EmptyState';
import { PageSkeleton } from '@/shared/components/Skeleton/PageSkeleton';
import { ShipmentFormFields } from '@/modules/international-purchases/components/ShipmentFormModal/ShipmentFormFields';
import {
  createInviteFetcher,
  readInviteToken,
  readJsonResponse,
} from '@/modules/international-purchases/utils/publicApi';

import './ShipmentRegistration.css';

const initialForm = {
  tracking_key: '',
  tracking_reference_type: 'MBL',
  tracking_provider_type: 'NAVIERA',
  tracking_provider_name: '',
  scac: '',
  portal_notes: '',
  proveedor: '',
  factura_codigo: '',
  agencia: '',
  material: '',
  contenedores_bl: '',
  custom_fields: [],
};

const SCAC_ENDPOINT = '/api/international-purchases/public/scac-catalog';

/**
 * Pagina publica de registro de embarques para forwarders.
 *
 * Va FUERA de ProtectedRoute: quien la abre no tiene cuenta en el sistema. Su
 * credencial es el token del enlace permanente que recibio por correo, que se
 * lee del fragmento de la URL (`#token=…`) y nunca de la query, porque el
 * fragmento no viaja al servidor ni queda en los logs de acceso.
 *
 * Tras enviar NO se cierra ni redirige: un forwarder suele registrar varios
 * embarques seguidos, asi que se le ofrece "Registrar otro embarque" con el
 * formulario limpio y el mismo enlace.
 */
export function ShipmentRegistration() {
  const token = useMemo(() => readInviteToken(), []);
  const fetcher = useMemo(() => createInviteFetcher(token), [token]);

  const [invite, setInvite] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [accessError, setAccessError] = useState('');

  const [form, setForm] = useState(initialForm);
  const [isSaving, setIsSaving] = useState(false);
  const [formErrors, setFormErrors] = useState([]);
  const [submitError, setSubmitError] = useState('');
  const [lastSaved, setLastSaved] = useState(null);

  const handleFormChange = useCallback((field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadInvite() {
      if (!token) {
        setAccessError(
          'El enlace no está completo. Ábralo tal como lo recibió por correo, sin recortarlo.',
        );
        setIsLoading(false);
        return;
      }

      try {
        const result = await readJsonResponse(
          await fetcher('/api/international-purchases/public/invite'),
        );

        if (cancelled) return;

        if (!result.ok) {
          setAccessError(result.message);
        } else {
          setInvite(result.data);
        }
      } catch {
        if (!cancelled) {
          setAccessError(
            'No se pudo contactar con el servidor. Revise su conexión e intente de nuevo.',
          );
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    loadInvite();

    return () => {
      cancelled = true;
    };
  }, [token, fetcher]);

  const handleSubmit = async (event) => {
    event.preventDefault();

    setIsSaving(true);
    setFormErrors([]);
    setSubmitError('');

    try {
      const result = await readJsonResponse(
        await fetcher('/api/international-purchases/public/shipments', {
          method: 'POST',
          body: JSON.stringify({
            trackingKey: form.tracking_key,
            trackingProviderType: form.tracking_provider_type,
            trackingProviderName: form.tracking_provider_name,
            scac: form.scac,
            supplierName: form.proveedor,
            invoiceCode: form.factura_codigo,
            agency: form.agencia,
            materialDescription: form.material,
            containerCount: form.contenedores_bl,
            notes: form.portal_notes,
            customFields: form.custom_fields,
          }),
        }),
      );

      if (result.ok) {
        setLastSaved(result.data);
        setForm(initialForm);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }

      // Un 401/403 a media captura significa que el enlace dejo de servir
      // (revocado o dormido) mientras el formulario estaba abierto. Se sube al
      // estado de acceso para que la pagina lo explique entera, en vez de dejar
      // un formulario que ya no puede enviar nada.
      if (result.status === 401 || result.status === 403) {
        setAccessError(result.message);
        setInvite(null);
        return;
      }

      setFormErrors(result.errors);
      setSubmitError(result.errors.length > 0 ? '' : result.message);
    } catch {
      setSubmitError(
        'No se pudo enviar el embarque. Revise su conexión e intente de nuevo.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  const startAnother = () => {
    setLastSaved(null);
    setFormErrors([]);
    setSubmitError('');
  };

  if (isLoading) {
    return (
      <main className="shipment-registration">
        <div className="shipment-registration-panel">
          <PageSkeleton />
        </div>
      </main>
    );
  }

  if (accessError) {
    return (
      <main className="shipment-registration">
        <div className="shipment-registration-panel">
          <EmptyState
            icon={Ship}
            tone="error"
            title="No podemos abrir este formulario"
            description={accessError}
          />
        </div>
      </main>
    );
  }

  return (
    <main className="shipment-registration">
      <div className="shipment-registration-panel">
        <header className="shipment-registration-header">
          <p className="shipment-registration-kicker">Maderas Rivero · Compras Internacionales</p>
          <h1>Registro de embarques</h1>
          <p className="shipment-registration-intro">
            Hola, <strong>{invite?.forwarderName}</strong>. Registre aquí los embarques que
            tenga con nosotros. Con el MBL damos seguimiento automático, así que no hace
            falta que lo envíe también por correo.
          </p>
        </header>

        {lastSaved ? (
          <div className="shipment-registration-success">
            <Alert variant="success" title="Embarque registrado">
              Recibimos el embarque <strong>{lastSaved.tracking_key}</strong>. Nuestro equipo
              lo revisará y el seguimiento ya está en marcha.
            </Alert>

            <Button
              type="button"
              variant="primary"
              onClick={startAnother}
              leftIcon={<CheckCircle2 size={16} aria-hidden="true" />}
            >
              Registrar otro embarque
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="shipment-form">
            {formErrors.length > 0 && (
              <Alert variant="error" title="Revise los datos capturados">
                <ul className="shipment-registration-errors">
                  {formErrors.map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              </Alert>
            )}

            {submitError && (
              <Alert variant="error" title="No se pudo registrar el embarque">
                {submitError}
              </Alert>
            )}

            <ShipmentFormFields
              form={form}
              onChange={handleFormChange}
              variant="external"
              fetcher={fetcher}
              scacEndpoint={SCAC_ENDPOINT}
            />

            <div className="shipment-registration-actions">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setForm(initialForm)}
                disabled={isSaving}
              >
                Limpiar formulario
              </Button>

              <Button type="submit" variant="primary" isLoading={isSaving} disabled={isSaving}>
                {isSaving ? 'Enviando…' : 'Enviar embarque'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
