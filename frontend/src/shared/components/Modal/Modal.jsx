import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import './Modal.css';

/**
 * Modal — Diálogo modal del proyecto.
 *
 * Se monta y desmonta con `isOpen`: mientras esté cerrado devuelve `null`, así
 * que los children no se renderizan y el estado interno de un formulario dentro
 * del modal se pierde al cerrar. Si necesitas conservar ese borrador, guárdalo
 * en la página, no dentro del modal.
 *
 * ── Comportamiento que aporta sin que se vea ─────────────────────────────────
 * - Cierra con Escape y con click en el fondo (el click dentro no se propaga).
 * - Focus-trap: Tab y Shift+Tab circulan solo entre los elementos del diálogo.
 * - Al abrir enfoca el botón de cerrar; al cerrar devuelve el foco al elemento
 *   que lo tenía antes.
 * - Bloquea el scroll del `body` mientras está abierto y lo restaura al salir.
 * - Marca `role="dialog"` + `aria-modal` y enlaza el título con `aria-labelledby`.
 *
 * ── Detalles de implementación que conviene conocer ──────────────────────────
 * - `onClose` se lee desde un ref, de modo que el efecto depende solo de
 *   `isOpen`. Puedes pasar una función inline sin provocar que el listener se
 *   vuelva a registrar en cada tecleo del formulario.
 * - **No usa portal**: el diálogo se renderiza donde lo montes, y se apoya en
 *   `--z-modal: 9000` para quedar por encima. Si lo colocas dentro de un
 *   contenedor con `overflow: hidden` o su propio contexto de apilamiento,
 *   puede recortarse.
 * - La cabecera (y con ella el botón de cerrar) solo aparece si pasas `title` o
 *   `subtitle`. Sin cabecera no hay botón de cerrar: deja siempre una salida
 *   visible en el `ModalFooter`.
 *
 * @param {boolean}          isOpen     - Controla el montaje. Requerido.
 * @param {() => void}       onClose    - Se dispara con Escape, con el botón de cerrar y con el click en el fondo. Requerido.
 * @param {React.ReactNode}  [title]    - Título de la cabecera.
 * @param {React.ReactNode}  [subtitle] - Texto secundario bajo el título.
 * @param {React.ReactNode}  children   - Contenido del cuerpo. Cierra con `<ModalFooter>` si necesitas acciones.
 * @param {string}           className  - Clases extra para `.modal-content` (útil para fijar el ancho). (default: '')
 *
 * @example
 * <Modal
 *   isOpen={isOpen}
 *   onClose={() => setIsOpen(false)}
 *   title="Nueva solicitud"
 *   subtitle="Completa los datos del equipo"
 * >
 *   <Input label="Folio" id="folio" value={form.folio} onChange={handleChange} />
 *
 *   <ModalFooter>
 *     <Button variant="secondary" onClick={() => setIsOpen(false)}>Cancelar</Button>
 *     <Button variant="primary" isLoading={isSaving} onClick={handleSubmit}>Guardar</Button>
 *   </ModalFooter>
 * </Modal>
 */
export function Modal({ isOpen, onClose, title, subtitle, children, className = '' }) {
  const firstFocusableRef = useRef(null);
  const contentRef = useRef(null);

  // Guardamos onClose en un ref para evitar que el efecto se re-ejecute
  // cada vez que el padre re-renderiza y recrea la función inline.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // Cerrar con Esc + bloquear scroll del body.
  // La dependencia es SOLO [isOpen]: el effect solo corre cuando el modal
  // abre o cierra, no en cada re-render provocado por cambios en el form.
  useEffect(() => {
    if (!isOpen) return;

    const previouslyFocused = document.activeElement;
    document.body.style.overflow = 'hidden';

    // Foco al botón de cerrar solo al abrir (primera ejecución para isOpen=true)
    firstFocusableRef.current?.focus();

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onCloseRef.current();
        return;
      }

      // Focus-trap: mantener Tab dentro del modal
      if (e.key === 'Tab' && contentRef.current) {
        const focusable = contentRef.current.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
      previouslyFocused?.focus();
    };
  }, [isOpen]); // ← solo isOpen; onClose se lee desde el ref

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <section
        ref={contentRef}
        className={`modal-content ${className}`}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'modal-title' : undefined}
      >
        {(title || subtitle) && (
          <header className="modal-header">
            <div>
              <h2 id="modal-title">{title}</h2>
              {subtitle && <p>{subtitle}</p>}
            </div>
            <button
              ref={firstFocusableRef}
              type="button"
              className="modal-close-button"
              onClick={onClose}
              aria-label="Cerrar modal"
            >
              <X size={18} />
            </button>
          </header>
        )}

        <div className="modal-body">
          {children}
        </div>
      </section>
    </div>
  );
}

/**
 * ModalFooter — Pie de acciones de `Modal`.
 *
 * Va como último hijo del `Modal` y alinea los botones a la derecha. Por
 * convención en el proyecto, la acción secundaria (Cancelar) va primero y la
 * primaria al final.
 *
 * @param {React.ReactNode}          children - Botones de acción.
 * @param {React.CSSProperties}      [style]  - Estilos en línea; se usa sobre todo para `justifyContent: 'space-between'` cuando hay una acción destructiva a la izquierda.
 *
 * @example
 * <ModalFooter style={{ justifyContent: 'space-between' }}>
 *   <Button variant="danger" onClick={handleDelete}>Eliminar</Button>
 *   <Button variant="primary" onClick={handleSave}>Guardar</Button>
 * </ModalFooter>
 */
export function ModalFooter({ children, style }) {
  return (
    <footer className="modal-footer" style={style}>
      {children}
    </footer>
  );
}
