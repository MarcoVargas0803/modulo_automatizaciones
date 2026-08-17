import React, { useState, useEffect, useRef } from 'react';
import { Modal, ModalFooter } from '@/shared/components/Modal/Modal';
import { Button } from '@/shared/components/Button/Button';
import { ShipmentFormFields } from './ShipmentFormFields';
import './ShipmentFormModal.css';

/**
 * Alta y edicion de un embarque desde el portal, dentro de un `Modal`.
 *
 * Los campos viven en `ShipmentFormFields`, que comparte con la pagina publica
 * del forwarder. Aqui solo queda lo propio del modal: el envoltorio, la
 * confirmacion de descarte y el pie con los botones.
 *
 * @param {object} props
 * @param {boolean} props.isOpen
 * @param {() => void} props.onClose
 * @param {(event: React.FormEvent) => void} props.onSubmit
 * @param {object} props.form Estado controlado del formulario.
 * @param {(field: string, value: any) => void} props.onChange
 * @param {boolean} [props.isSaving]
 * @param {string} [props.editingShipmentId] Su presencia activa el modo edicion.
 * @param {object} [props.editingShipment]
 *
 * @example
 * <ShipmentFormModal
 *   isOpen={isFormOpen}
 *   onClose={closeForm}
 *   onSubmit={handleSubmit}
 *   form={form}
 *   onChange={handleFormChange}
 *   isSaving={isSaving}
 *   editingShipmentId={editingShipmentId}
 *   editingShipment={editingShipment}
 * />
 */
export function ShipmentFormModal({
  isOpen,
  onClose,
  onSubmit,
  form,
  onChange,
  isSaving,
  editingShipmentId,
  editingShipment
}) {
  const isEditing = Boolean(editingShipmentId);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const initialSnapshotRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      initialSnapshotRef.current = JSON.stringify(form);
      setShowDiscardConfirm(false);
    }
  }, [isOpen]);

  const handleAttemptClose = () => {
    const isDirty =
      initialSnapshotRef.current !== null &&
      JSON.stringify(form) !== initialSnapshotRef.current;

    if (isDirty) {
      setShowDiscardConfirm(true);
      return;
    }

    onClose();
  };

  const confirmDiscard = () => {
    setShowDiscardConfirm(false);
    onClose();
  };

  return (
    <>
    <Modal
      isOpen={isOpen}
      onClose={handleAttemptClose}
      title={isEditing ? 'Editar embarque' : 'Registrar embarque'}
      subtitle={
        isEditing
          ? 'Corrige los datos del embarque. Las fechas las mantiene el rastreo y no son editables.'
          : 'Captura la referencia del embarque (MBL), proveedor y SCAC.'
      }
    >
      <form onSubmit={onSubmit} className="shipment-form">
        <ShipmentFormFields
          form={form}
          onChange={onChange}
          isEditing={isEditing}
          editingShipment={editingShipment}
          isOpen={isOpen}
        />

        <ModalFooter style={{ padding: '1rem 0 0', borderTop: 'none', marginTop: '1rem' }}>
          <Button
            type="button"
            variant="secondary"
            onClick={handleAttemptClose}
            disabled={isSaving}
          >
            Cancelar
          </Button>

          <Button type="submit" variant="primary" disabled={isSaving}>
            {isSaving
              ? 'Guardando…'
              : isEditing
                ? 'Guardar cambios'
                : 'Guardar embarque'}
          </Button>
        </ModalFooter>
      </form>
    </Modal>

    <Modal
      isOpen={showDiscardConfirm}
      onClose={() => setShowDiscardConfirm(false)}
      title="Descartar cambios"
      className="modal-sm"
    >
      <p style={{
        margin: '0 0 var(--spacing-3)',
        color: 'var(--color-on-surface-variant)',
        fontSize: '0.9375rem',
        lineHeight: 1.6,
      }}>
        Tienes cambios sin guardar en este embarque. ¿Deseas descartarlos y cerrar?
      </p>

      <ModalFooter>
        <Button type="button" variant="secondary" onClick={() => setShowDiscardConfirm(false)}>
          Seguir editando
        </Button>
        <Button type="button" variant="danger" onClick={confirmDiscard}>
          Descartar cambios
        </Button>
      </ModalFooter>
    </Modal>
    </>
  );
}
