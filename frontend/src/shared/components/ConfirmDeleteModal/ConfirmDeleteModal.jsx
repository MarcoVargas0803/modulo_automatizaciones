import React from 'react';
import { Modal, ModalFooter } from '@/shared/components/Modal/Modal';
import { Button } from '@/shared/components/Button/Button';

/**
 * ConfirmDeleteModal — Confirmación de borrado irreversible.
 *
 * Composición fina sobre `Modal` + `ModalFooter` + `Button`: no tiene CSS propio
 * ni estado. Presenta dos acciones, "Cancelar" y "Borrar" (variante `danger`),
 * y bloquea ambas mientras `isSaving` esté activo para evitar el doble envío.
 *
 * ── ATENCIÓN: está acoplado al dominio de embarques ──────────────────────────
 * El texto **"¿Seguro que deseas borrar el embarque X?" está escrito a mano** en
 * el componente, y la prop que lo rellena se llama `trackingKey`. Pese a vivir
 * en `shared/components/`, hoy **no es reutilizable fuera de compras
 * internacionales** — su único consumidor es `InternationalPurchases`.
 *
 * Para cumplir la regla de confirmar los DELETE en otro módulo (p. ej.
 * Mantenimiento) hay dos vías: generalizar este componente con props de texto
 * —lo que cambia su firma y obliga a tocar el consumidor actual— o montar un
 * `Modal` propio. Ampliarlo es la opción preferible, pero **es un cambio que
 * afecta a código existente y debe consultarse antes**.
 *
 * No cierra nada por su cuenta: `onConfirm` no llama a `onClose`. Quien lo usa
 * decide si cierra al confirmar, al terminar la petición o si lo deja abierto
 * mostrando el error.
 *
 * @param {boolean}    isOpen        - Controla el montaje del `Modal`.
 * @param {() => void} onClose       - Cierre por Escape, fondo, botón de cerrar o "Cancelar".
 * @param {() => void} onConfirm     - Acción de borrado. No cierra el modal por sí misma.
 * @param {string}     [trackingKey] - Identificador del embarque, resaltado en el texto.
 * @param {boolean}    [isSaving]    - Bloquea "Cancelar" y pone "Borrar" en estado de carga.
 *
 * @example
 * const [aBorrar, setABorrar] = useState(null);
 *
 * <ConfirmDeleteModal
 *   isOpen={Boolean(aBorrar)}
 *   trackingKey={aBorrar?.trackingKey}
 *   isSaving={isDeleting}
 *   onClose={() => setABorrar(null)}
 *   onConfirm={async () => {
 *     await borrarEmbarque(aBorrar.id);
 *     setABorrar(null);
 *   }}
 * />
 */
export function ConfirmDeleteModal({ isOpen, onClose, onConfirm, trackingKey, isSaving }) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Confirmar borrado"
      className="modal-sm"
    >
      <p style={{
        margin: '0 0 var(--spacing-3)',
        color: 'var(--color-on-surface-variant)',
        fontSize: '0.9375rem',
        lineHeight: 1.6,
      }}>
        ¿Seguro que deseas borrar el embarque{' '}
        <strong style={{ color: 'var(--color-on-surface)' }}>{trackingKey}</strong>?{' '}
        Esta acción es irreversible.
      </p>

      <ModalFooter>
        <Button
          type="button"
          variant="secondary"
          onClick={onClose}
          disabled={isSaving}
        >
          Cancelar
        </Button>

        <Button
          type="button"
          variant="danger"
          onClick={onConfirm}
          isLoading={isSaving}
        >
          {isSaving ? 'Borrando…' : 'Borrar'}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
