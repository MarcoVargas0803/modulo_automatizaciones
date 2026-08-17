import React, { useEffect, useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { apiFetch } from '@/shared/utils/apiClient';
import { Alert } from '@/shared/components/Alert/Alert';
import { Input } from '@/shared/components/Input/Input';
import { Button } from '@/shared/components/Button/Button';
import { Hint } from '@/shared/components/Hint/Hint';
import { formatDate } from '@/shared/utils/formatters';
// Las clases de estos campos (.form-grid, .form-field, .custom-fields-*) ya
// vivian en ShipmentFormModal.css y se quedan ahi: son las mismas para los dos
// consumidores y duplicarlas en un archivo nuevo solo garantizaria que un dia
// diverjan. Se importa desde aqui para que la pagina publica, que no monta el
// modal, tambien las reciba.
import './ShipmentFormModal.css';

const MAX_CUSTOM_FIELDS = 20;

/**
 * Campos de un embarque, sin envoltorio.
 *
 * Se extrajo de ShipmentFormModal porque el formulario tiene DOS presentaciones
 * y solo una es un modal:
 *
 *   - El operador lo abre desde el listado -> ShipmentFormModal lo envuelve en
 *     `Modal`.
 *   - El forwarder llega a una pagina que ES el formulario -> ShipmentRegistration
 *     lo renderiza en linea.
 *
 * Reutilizar el modal en la pagina publica se descarto por una razon concreta:
 * `Modal` cierra con Escape, con clic en el fondo y con su boton X. En una
 * pagina que no tiene nada detras, esos tres gestos le vaciarian el formulario
 * al forwarder sin que exista un "atras" al que volver.
 *
 * No lleva `<form>` ni botones: los pone cada consumidor, porque el pie de un
 * modal y el de una pagina no se parecen.
 *
 * @param {object} props
 * @param {object} props.form Estado controlado.
 * @param {(field: string, value: any) => void} props.onChange
 * @param {boolean} [props.isEditing]
 * @param {object} [props.editingShipment] Solo para mostrar las fechas de rastreo.
 * @param {boolean} [props.isOpen] Si es false, no se pide el catalogo SCAC. La
 *   pagina publica no lo pasa: alli el formulario esta siempre visible.
 * @param {(path: string, options?: RequestInit) => Promise<Response>} [props.fetcher]
 * @param {string} [props.scacEndpoint] Ruta del catálogo SCAC. Son dos, con el
 *   mismo cuerpo y distinto guard: la interna exige sesión y proceso, la pública
 *   el token del enlace. Ambas devuelven `[{ scac, name }]` ya normalizado, así
 *   que aquí no se adivina la forma. Si falla, el campo sigue siendo escribible
 *   —es un datalist— y se avisa debajo; quien decide si el código vale es el
 *   servidor, al guardar.
 * @param {'internal'|'external'} [props.variant]
 */
export function ShipmentFormFields({
  form,
  onChange,
  isEditing = false,
  editingShipment = null,
  isOpen = true,
  fetcher = apiFetch,
  scacEndpoint = '/api/international-purchases/scac-catalog',
  variant = 'internal',
}) {
  const [scacOptions, setScacOptions] = useState([]);
  const [scacCatalogFailed, setScacCatalogFailed] = useState(false);
  const isExternal = variant === 'external';

  // La referencia dejó de ser de solo lectura al editar, para poder corregir un MBL
  // mal capturado. No es un cambio menor: el backend descarta el historial de rastreo
  // —pertenece al MBL anterior, no a este embarque— y vuelve a pedir el rastreo. Se
  // avisa solo cuando el valor cambia de verdad, no por el hecho de estar editando.
  const referenceChanged =
    isEditing &&
    Boolean(editingShipment?.tracking_key) &&
    form.tracking_key?.trim().toUpperCase() !== editingShipment.tracking_key.toUpperCase();

  // La naviera correspondiente al código tecleado, si es una del catálogo. Se
  // usa para avisar de dos cosas que el usuario no puede deducir del código:
  // que esa naviera no admite rastreo por MBL, o que está en mantenimiento.
  const selectedCarrier = useMemo(
    () => scacOptions.find((opt) => opt.scac === form.scac) || null,
    [scacOptions, form.scac],
  );

  const customFields = Array.isArray(form.custom_fields) ? form.custom_fields : [];

  const updateCustomField = (index, key, value) => {
    onChange('custom_fields', customFields.map((field, i) => (
      i === index ? { ...field, [key]: value } : field
    )));
  };

  const addCustomField = () => {
    if (customFields.length >= MAX_CUSTOM_FIELDS) return;
    onChange('custom_fields', [...customFields, { label: '', value: '' }]);
  };

  const removeCustomField = (index) => {
    onChange('custom_fields', customFields.filter((_, i) => i !== index));
  };

  useEffect(() => {
    let active = true;
    if (isOpen) {
      setScacCatalogFailed(false);

      fetcher(scacEndpoint)
        .then((res) => (res.ok ? res.json() : null))
        .then((json) => {
          if (!active) return;

          if (json?.success && Array.isArray(json.data)) {
            setScacOptions(json.data);
          } else {
            // Respuesta que no sirve (500 de Sinay, 401 de enlace caducado…).
            // No es lo mismo que un catálogo vacío legítimo, pero para el
            // usuario el efecto es el mismo: se queda sin sugerencias.
            setScacCatalogFailed(true);
          }
        })
        // Se tragaba el fallo entero: el campo se quedaba sin sugerencias y
        // nadie sabía por qué. No es bloqueante —es un datalist, se puede
        // teclear— así que se avisa junto al campo en vez de romper el
        // formulario. El servidor valida el SCAC igualmente.
        .catch(() => {
          if (active) setScacCatalogFailed(true);
        });
    }
    return () => {
      active = false;
    };
    // `fetcher` se omite a proposito: la pagina publica lo memoriza, pero si un
    // consumidor futuro lo creara en cada render, esta dependencia dispararia
    // una peticion por render al catalogo de Sinay, que es una API de pago.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, scacEndpoint]);

  return (
    <>
      {referenceChanged && (
        <Alert variant="warning" title="Vas a cambiar la referencia del embarque">
          Pasará de <strong>{editingShipment.tracking_key}</strong> a{' '}
          <strong>{form.tracking_key.trim().toUpperCase()}</strong>. Se descartará el
          historial de rastreo acumulado, porque pertenece a la referencia anterior, y
          se solicitará un rastreo nuevo. Las fechas se repoblarán en la siguiente
          actualización.
        </Alert>
      )}

      <div className="form-grid">
        <label className="form-field">
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            Referencia <Hint text="Master Bill of Lading (MBL) del embarque" position="bottom" />
          </span>
          <Input
            name="tracking_key"
            autoComplete="off"
            placeholder="Ej. ONEYHAMU12345600"
            value={form.tracking_key}
            onChange={(e) => onChange('tracking_key', e.target.value)}
          />
        </label>

        <label className="form-field">
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            Tipo de proveedor <Hint text="Selecciona si el transporte es operado por Naviera o Forwarder" position="bottom" />
          </span>
          <select
            name="tracking_provider_type"
            value={form.tracking_provider_type}
            onChange={(e) => onChange('tracking_provider_type', e.target.value)}
          >
            <option value="NAVIERA">Naviera</option>
            <option value="FORWARDER">Forwarder</option>
          </select>
        </label>


        <label className="form-field">
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            SCAC <Hint text="Standard Carrier Alpha Code (4 letras)" position="bottom" />
          </span>
          <Input
            name="scac"
            list="scac-list"
            autoComplete="off"
            placeholder="Ej. ONEY, MSCU, CMDU"
            value={form.scac}
            onChange={(e) => {
              const newScac = e.target.value.toUpperCase();
              onChange('scac', newScac);

              const matchedOption = scacOptions.find((opt) => opt.scac === newScac);

              if (matchedOption && !form.tracking_provider_name) {
                onChange('tracking_provider_name', matchedOption.name);
              }
            }}
          />
          {/* El backend entrega siempre `{ scac, name }`. Antes pasaba la
              respuesta cruda de Sinay y aquí había que adivinar la forma con
              `opt.scac || opt.code || opt.id`, con una clave `UNKNOWN-${idx}`
              de último recurso; esa adivinanza vive ahora una sola vez, en
              services/scacCatalog.service.js. */}
          <datalist id="scac-list">
            {scacOptions.map((opt) => (
              <option key={opt.scac} value={opt.scac}>
                {opt.name}
              </option>
            ))}
          </datalist>
          {scacCatalogFailed && (
            <span className="field-note" role="status">
              No se pudo cargar el catálogo de navieras. Puede escribir el SCAC a mano;
              se validará al guardar.
            </span>
          )}
          {/* Avisos, no bloqueos: el embarque se registra igual. Se prefiere que
              el operador sepa por qué el rastreo no va a avanzar antes de
              guardar, en vez de descubrirlo cuando las fechas nunca llegan. */}
          {selectedCarrier && !selectedCarrier.supportsBl && (
            <span className="field-note warning" role="status">
              {selectedCarrier.name} no admite rastreo por MBL. Puede registrar el
              embarque, pero el seguimiento no se actualizará solo.
            </span>
          )}
          {selectedCarrier?.supportsBl && selectedCarrier.maintenance && (
            <span className="field-note warning" role="status">
              {selectedCarrier.name} está en mantenimiento en el proveedor de rastreo.
              El seguimiento puede tardar en empezar.
            </span>
          )}
        </label>

        <label className="form-field">
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            Naviera / Forwarder <Hint text="Nombre y tipo de proveedor de transporte de carga" position="bottom" />
          </span>
          <Input
            name="tracking_provider_name"
            autoComplete="off"
            placeholder="Ej. ONE, MSC, DHL Global Forwarding"
            value={form.tracking_provider_name}
            onChange={(e) => onChange('tracking_provider_name', e.target.value)}
          />
        </label>

        

        <label className="form-field">
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            Proveedor <Hint text="Nombre del proveedor internacional" position="bottom" />
          </span>
          <Input
            name="proveedor"
            autoComplete="off"
            placeholder="Ej. Proveedor S.A."
            value={form.proveedor}
            onChange={(e) => onChange('proveedor', e.target.value)}
          />
        </label>

        <label className="form-field">
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            Código de Factura <Hint text="Código o folio de la factura asociada" position="bottom" />
          </span>
          <Input
            name="factura_codigo"
            autoComplete="off"
            placeholder="Ej. FAC-12345"
            value={form.factura_codigo}
            onChange={(e) => onChange('factura_codigo', e.target.value)}
          />
        </label>

        <label className="form-field">
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            Agencia <Hint text="Agencia aduanal o logística" position="bottom" />
          </span>
          <Input
            name="agencia"
            autoComplete="off"
            placeholder="Ej. Agencia Aduanal"
            value={form.agencia}
            onChange={(e) => onChange('agencia', e.target.value)}
          />
        </label>

        <label className="form-field">
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            Material <Hint text="Descripción del material" position="bottom" />
          </span>
          <Input
            name="material"
            autoComplete="off"
            placeholder="Ej. Madera de Pino"
            value={form.material}
            onChange={(e) => onChange('material', e.target.value)}
          />
        </label>

        <label className="form-field">
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            Contenedores BL <Hint text="Cantidad de contenedores amparados" position="bottom" />
          </span>
          <Input
            type="number"
            name="contenedores_bl"
            placeholder="Ej. 1"
            min="0"
            value={form.contenedores_bl}
            onChange={(e) => onChange('contenedores_bl', e.target.value)}
          />
        </label>

        {isEditing && (
          <>
            <div className="form-field">
              <span>ETD</span>
              <strong className="readonly-value">{formatDate(editingShipment?.etd)}</strong>
            </div>
            <div className="form-field">
              <span>ETA</span>
              <strong className="readonly-value">{formatDate(editingShipment?.eta)}</strong>
            </div>
            <div className="form-field">
              <span>ATD</span>
              <strong className="readonly-value">{formatDate(editingShipment?.atd)}</strong>
            </div>
            <div className="form-field">
              <span>ATA</span>
              <strong className="readonly-value">{formatDate(editingShipment?.ata)}</strong>
            </div>
          </>
        )}
      </div>

      <label className="form-field">
        <span>{isExternal ? 'Comentarios' : 'Observaciones'}</span>
        <textarea
          name="portal_notes"
          placeholder={
            isExternal
              ? 'Cualquier detalle que Maderas Rivero deba saber de este embarque (opcional)'
              : 'Notas internas opcionales'
          }
          value={form.portal_notes}
          onChange={(e) => onChange('portal_notes', e.target.value)}
        />
      </label>

      <div className="custom-fields-section">
        <div className="custom-fields-header">
          <span className="form-field-label">
            Campos personalizados
            <Hint
              text={
                isExternal
                  ? 'Datos adicionales que quieras aportar (ej. Pedido, Contrato, Aduana)'
                  : 'Campos adicionales definidos por el operador (ej. Pedido, Contrato, Aduana)'
              }
              position="bottom"
            />
          </span>
          <Button
            type="button"
            variant="secondary"
            onClick={addCustomField}
            disabled={customFields.length >= MAX_CUSTOM_FIELDS}
            leftIcon={<Plus size={14} aria-hidden="true" />}
          >
            Agregar campo
          </Button>
        </div>

        {customFields.length === 0 ? (
          <p className="custom-fields-empty">
            Sin campos personalizados. Agrega los que necesites para este embarque.
          </p>
        ) : (
          <div className="custom-fields-list">
            {customFields.map((field, index) => (
              <div className="custom-field-row" key={index}>
                <Input
                  autoComplete="off"
                  placeholder="Nombre del campo"
                  value={field.label || ''}
                  onChange={(e) => updateCustomField(index, 'label', e.target.value)}
                />
                <Input
                  autoComplete="off"
                  placeholder="Valor"
                  value={field.value || ''}
                  onChange={(e) => updateCustomField(index, 'value', e.target.value)}
                />
                <button
                  type="button"
                  className="custom-field-remove"
                  onClick={() => removeCustomField(index)}
                  aria-label="Quitar campo"
                >
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
