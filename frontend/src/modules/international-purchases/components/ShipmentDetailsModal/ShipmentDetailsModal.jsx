import React from 'react';
import { Modal, ModalFooter } from '@/shared/components/Modal/Modal';
import { Button } from '@/shared/components/Button/Button';
import { Badge } from '@/shared/components/Badge/Badge';
import { Hint } from '@/shared/components/Hint/Hint';
import { formatDateTime, formatDate, trackingErrorText } from '@/shared/utils/formatters';
import { shipmentStatusVariant } from '@/modules/international-purchases/utils/shipmentStatus';
import { WARNING_SEVERITY_ICON, warningSeverity } from '@/modules/international-purchases/utils/shipmentWarnings';

/**
 * ShipmentDetailsModal — Ficha completa de un embarque, en modal de solo lectura.
 *
 * Recibe la fila tal como la devuelve `GET /international-purchases/shipments` y
 * la despliega en dos columnas, con las acciones de editar, borrar y —si está
 * pendiente— marcar como revisado.
 *
 * ── `warningCatalogMap` no es opcional en la práctica ────────────────────────
 * Es el mismo diccionario que consume la tabla, y de él salen las dos cosas que
 * hacen legible una advertencia: la frase del `hint` y la gravedad que decide
 * color e icono. Sin él los códigos se muestran crudos y todos en `info`. Hubo
 * un tiempo en que la página se lo pasaba y el componente no lo desestructuraba,
 * así que eso era justo lo que ocurría aquí mientras la tabla sí traducía.
 *
 * @param {boolean} isOpen        - Si el modal está visible.
 * @param {Function} onClose      - Cierra el modal.
 * @param {object} shipment       - Fila del embarque. Con `null` el componente no pinta nada.
 * @param {Function} onDeleteRequest - Pide confirmación de borrado; recibe el embarque.
 * @param {Function} onEditRequest   - Abre el formulario de edición; recibe el embarque.
 * @param {Function} onReviewRequest - Cierra el ciclo de revisión; recibe `(embarque, decisión)`.
 *   Con `'REVIEWED'` marca como revisada un alta de forwarder pendiente **y también
 *   reactiva un embarque descartado** —el endpoint no comprueba el estado previo—.
 *   Con `'DISCARDED'` lo aparta sin borrarlo.
 * @param {boolean} [isReviewing]    - Deshabilita la acción de revisar mientras viaja la petición. (default: false)
 * @param {Record<string, {label_es: string, severity?: string}>} [warningCatalogMap] - Catálogo de advertencias, el mismo que usa la tabla. (default: {})
 *
 * @example
 * <ShipmentDetailsModal
 *   isOpen={isDetailsModalOpen}
 *   onClose={() => setIsDetailsModalOpen(false)}
 *   shipment={selectedShipment}
 *   warningCatalogMap={warningCatalogMap}
 *   onEditRequest={handleEdit}
 *   onDeleteRequest={setDeleteTarget}
 *   onReviewRequest={handleReview}
 * />
 */
export function ShipmentDetailsModal({
  isOpen,
  onClose,
  shipment,
  onDeleteRequest,
  onEditRequest,
  onReviewRequest,
  isReviewing = false,
  warningCatalogMap = {}
}) {
  if (!shipment) return null;

  const warningCodes = Array.isArray(shipment.warnings) ? shipment.warnings : [];
  const isPendingReview = shipment.review_status === 'PENDING_REVIEW';
  const isDiscarded = shipment.review_status === 'DISCARDED';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Detalles del Embarque"
      subtitle={`Referencia: ${shipment.tracking_key}`}
    >
      <div className="form-grid" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.875rem', color: 'var(--color-muted-text)' }}>
            ID del Embarque <Hint text="Identificador único interno del embarque en el sistema" position="bottom" />
          </span>
          <strong style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>
            {shipment.shipment_id || '-'}
          </strong>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.875rem', color: 'var(--color-muted-text)' }}>
            Referencia <Hint text="Master Bill of Lading (MBL) del embarque" position="bottom" />
          </span>
          <strong>{shipment.tracking_key} ({shipment.tracking_reference_type || '-'})</strong>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.875rem', color: 'var(--color-muted-text)' }}>
            Tipo <Hint text="Tipo de documento de transporte: BL (Bill of Lading), BK (Booking), CT (Container), DC (Documento de Carga)" position="bottom" />
          </span>
          <strong>{shipment.shipment_type || '-'}</strong>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.875rem', color: 'var(--color-muted-text)' }}>
            Naviera / Forwarder <Hint text="Nombre y tipo de proveedor de transporte de carga" position="bottom" />
          </span>
          <strong>{shipment.tracking_provider_name || '-'}</strong>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.875rem', color: 'var(--color-muted-text)' }}>
            SCAC <Hint text="Standard Carrier Alpha Code (4 letras)" position="bottom" />
          </span>
          <strong>{shipment.scac || '-'}</strong>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.875rem', color: 'var(--color-muted-text)' }}>
            Estatus <Hint text="PLANNED: Planeado, IN_TRANSIT: En tránsito, DELIVERED: Entregado, UNKNOWN: Desconocido" position="bottom" />
          </span>
          <div>
            <Badge variant={shipmentStatusVariant(shipment.shipment_status)} size="sm">
              {shipment.shipment_status}
            </Badge>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.875rem', color: 'var(--color-muted-text)' }}>
            ETA <Hint text="Fecha estimada de llegada" position="bottom" />
          </span>
          <strong>{formatDate(shipment.eta)}</strong>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.875rem', color: 'var(--color-muted-text)' }}>
            ETD <Hint text="Fecha estimada de salida" position="bottom" />
          </span>
          <strong>{formatDate(shipment.etd)}</strong>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.875rem', color: 'var(--color-muted-text)' }}>
            ATA <Hint text="Fecha real de llegada" position="bottom" />
          </span>
          <strong>{formatDate(shipment.ata)}</strong>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.875rem', color: 'var(--color-muted-text)' }}>
            ATD <Hint text="Fecha real de salida" position="bottom" />
          </span>
          <strong>{formatDate(shipment.atd)}</strong>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.875rem', color: 'var(--color-muted-text)' }}>
            Terminal <Hint text="Lugar o puerto de destino/origen" position="bottom" />
          </span>
          <strong>{shipment.terminal || '-'}</strong>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <span style={{ fontSize: '0.875rem', color: 'var(--color-muted-text)' }}>Última actualización</span>
          <strong>{formatDateTime(shipment.updated_at)}</strong>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.875rem', color: 'var(--color-muted-text)' }}>
            Proveedor <Hint text="Nombre del proveedor internacional" position="bottom" />
          </span>
          <strong>{shipment.supplier_name || '-'}</strong>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.875rem', color: 'var(--color-muted-text)' }}>
            Código de factura <Hint text="Código o folio de la factura asociada" position="bottom" />
          </span>
          <strong>{shipment.invoice_code || '-'}</strong>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.875rem', color: 'var(--color-muted-text)' }}>
            Agencia <Hint text="Agencia aduanal o logística" position="bottom" />
          </span>
          <strong>{shipment.agency || '-'}</strong>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.875rem', color: 'var(--color-muted-text)' }}>
            Material <Hint text="Descripción del material" position="bottom" />
          </span>
          <strong>{shipment.material_description || '-'}</strong>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.875rem', color: 'var(--color-muted-text)' }}>
            Contenedores BL <Hint text="Cantidad de contenedores amparados" position="bottom" />
          </span>
          <strong>{shipment.container_count ?? '-'}</strong>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        <span style={{ fontSize: '0.875rem', color: 'var(--color-muted-text)' }}>Advertencias</span>
        {warningCodes.length === 0 ? (
          <span className="muted-text">-</span>
        ) : (
          // Sin `stopPropagation`, a diferencia de la tabla: aquí no hay fila
          // pulsable de la que defenderse.
          <div className="shipment-warnings">
            {warningCodes.map((code) => {
              const entry = warningCatalogMap[code];
              const severity = warningSeverity(entry);

              return (
                <Badge
                  key={code}
                  variant={severity}
                  size="sm"
                  icon={WARNING_SEVERITY_ICON[severity]}
                  hint={entry?.label_es || code}
                >
                  {code}
                </Badge>
              );
            })}
          </div>
        )}
      </div>

      {shipment.last_tracking_error && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginTop: '1rem' }}>
          <span style={{ fontSize: '0.875rem', color: 'var(--color-muted-text)' }}>Error de tracking</span>
          <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--color-on-error-container)', backgroundColor: 'var(--color-error-container)', border: '1px solid var(--color-error)', padding: '0.75rem', borderRadius: '6px' }}>
            {trackingErrorText(shipment.last_tracking_error)}
            {shipment.last_tracking_error_at && (
              <span style={{ display: 'block', marginTop: '0.35rem', fontSize: '0.8rem', color: 'var(--color-on-error-container)' }}>
                Detectado: {formatDateTime(shipment.last_tracking_error_at)}
              </span>
            )}
          </p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginTop: '1rem' }}>
        <span style={{ fontSize: '0.875rem', color: 'var(--color-muted-text)' }}>Observaciones</span>
        <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--color-on-surface-variant)', backgroundColor: 'var(--color-surface-variant)', padding: '0.75rem', borderRadius: '6px', minHeight: '3rem' }}>
          {shipment.portal_notes || 'Sin observaciones.'}
        </p>
      </div>

      {Array.isArray(shipment.custom_fields) && shipment.custom_fields.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1rem' }}>
          <span style={{ fontSize: '0.875rem', color: 'var(--color-muted-text)' }}>Campos personalizados</span>
          <div className="form-grid">
            {shipment.custom_fields.map((field, index) => (
              <div key={index} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--color-muted-text)' }}>{field.label}</span>
                <strong>{field.value || '-'}</strong>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Solo aparece en lo que registro un forwarder. Descartar sustituye al
          borrado en ese caso: conserva la fila y su historial de rastreo, que
          el DELETE purga. */}
      {isPendingReview && onReviewRequest && (
        <div className="shipment-review-actions">
          <span className="muted-text">
            Este embarque lo registró un forwarder y aún no se ha revisado.
          </span>

          <div className="shipment-review-buttons">
            <Button
              type="button"
              variant="secondary"
              disabled={isReviewing}
              onClick={() => onReviewRequest(shipment, 'DISCARDED')}
            >
              Descartar
            </Button>
            <Button
              type="button"
              variant="primary"
              isLoading={isReviewing}
              disabled={isReviewing}
              onClick={() => onReviewRequest(shipment, 'REVIEWED')}
            >
              Marcar revisado
            </Button>
          </div>
        </div>
      )}

      {/* Descartar no borra: conserva la fila y su historial. Esto es la vuelta
          atrás, que hasta ahora no existía en la interfaz —un embarque
          descartado no se podía recuperar—. Reutiliza el mismo `onReviewRequest`
          que el bloque de arriba: el endpoint no comprueba el estado previo, así
          que volver a REVIEWED ya era una llamada válida. */}
      {isDiscarded && onReviewRequest && (
        <div className="shipment-review-actions">
          <span className="muted-text">
            Este embarque está descartado y no aparece en el listado por defecto.
            Sus indicadores tampoco lo cuentan.
          </span>

          <div className="shipment-review-buttons">
            <Button
              type="button"
              variant="primary"
              isLoading={isReviewing}
              disabled={isReviewing}
              onClick={() => onReviewRequest(shipment, 'REVIEWED')}
            >
              Reactivar embarque
            </Button>
          </div>
        </div>
      )}

      <ModalFooter>
        <Button
          type="button"
          variant="secondary"
          onClick={() => onDeleteRequest(shipment)}
        >
          Borrar
        </Button>
        <Button
          type="button"
          variant="primary"
          onClick={() => onEditRequest(shipment)}
        >
          Modificar
        </Button>
      </ModalFooter>
    </Modal>
  );
}
