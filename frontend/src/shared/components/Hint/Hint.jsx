import React, { useState, useRef, useEffect, useId } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle } from 'lucide-react';
import './Hint.css';

/**
 * Hint — Tooltip bajo demanda para aclarar un encabezado o un dato.
 *
 * Pensado para explicar columnas de tabla sin gastar espacio permanente. Es el
 * componente más usado del sistema y el único que se dibuja con `createPortal`
 * sobre `document.body`, lo que le permite salir de contenedores con `overflow`.
 *
 * ── Trampas ──────────────────────────────────────────────────────────────────
 * - **Sin `text` desaparece sin avisar.** La primera línea es
 *   `if (!text) return children || null`: si el texto llega vacío —por ejemplo
 *   de un campo opcional de la API— no hay tooltip ni icono, se devuelven los
 *   children pelados. No falla, simplemente no está.
 * - **Sin soporte táctil.** Se abre con hover, con foco (tab) o con Enter/Espacio
 *   estando enfocado, y se cierra con Escape sin perder el foco — pero no tiene
 *   equivalente táctil: en móvil su contenido es inalcanzable. Nunca poner ahí
 *   información imprescindible.
 *
 * El tooltip se pinta invertido —fondo `--color-on-surface`, texto
 * `--color-surface`— así que se adapta solo al tema oscuro. Se apila con
 * `--z-modal`: al estar portado a `document.body` gana al modal por orden de
 * documento, pero queda por debajo de `--z-toast`.
 *
 * Único componente del directorio con `export default` además del named export;
 * es una excepción histórica, la convención del proyecto es solo named export.
 *
 * @param {string}                            [text]     - Contenido del tooltip. Sin él el componente no dibuja nada.
 * @param {'top'|'bottom'|'left'|'right'}     position   - Lado en el que se abre. En el sistema real casi siempre `bottom`. (default: 'top')
 * @param {number}                            size       - Tamaño del icono por defecto. Se ignora si se pasan children. (default: 14)
 * @param {React.ReactNode}                   [children] - Disparador propio en lugar del icono de interrogación.
 * @param {string}                            className  - Clases extra para el contenedor del disparador. (default: '')
 *
 * @example
 * // Su uso real: dentro del encabezado de una columna de DataTable
 * {
 *   header: <>Folio<Hint text="Identificador único de la solicitud." position="bottom" /></>,
 *   accessor: 'folio',
 * }
 *
 * @example
 * // Con disparador propio en vez del icono
 * <Hint text="Se recalcula cada hora." position="bottom">
 *   <Badge variant="info" size="sm">Estimado</Badge>
 * </Hint>
 */
export const Hint = ({ text, position = 'top', size = 14, className = '', children }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [coords, setCoords] = useState(null);
  const triggerRef = useRef(null);
  const tooltipId = useId();

  if (!text) return children || null;

  const updatePosition = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setCoords({
        top: rect.top,
        left: rect.left,
        bottom: rect.bottom,
        right: rect.right,
        width: rect.width,
        height: rect.height,
      });
    }
  };

  const handleMouseEnter = () => {
    updatePosition();
    setIsVisible(true);
  };

  const handleMouseLeave = () => {
    setIsVisible(false);
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      setIsVisible(false);
    } else if (event.key === 'Enter' || event.key === ' ') {
      // Espacio también hace scroll por default en un elemento no nativo (span).
      event.preventDefault();
      updatePosition();
      setIsVisible((current) => !current);
    }
  };

  // Actualizar posición en scroll o cambio de tamaño de ventana mientras esté abierto
  useEffect(() => {
    if (!isVisible) return;

    const handleScrollOrResize = () => {
      updatePosition();
    };

    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);

    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [isVisible]);

  const renderTooltip = () => {
    if (!isVisible || !coords) return null;

    // Solo la posición calculada. `position`, `z-index` y `pointer-events`
    // los fija `.hint-portal-tooltip`: repetirlos aquí los volvía inline y el
    // CSS quedaba sin efecto.
    let tooltipStyle = {};

    const OFFSET = 8;

    if (position === 'top') {
      tooltipStyle.top = `${coords.top - OFFSET}px`;
      tooltipStyle.left = `${coords.left + coords.width / 2}px`;
      tooltipStyle.transform = 'translate(-50%, -100%)';
    } else if (position === 'bottom') {
      tooltipStyle.top = `${coords.bottom + OFFSET}px`;
      tooltipStyle.left = `${coords.left + coords.width / 2}px`;
      tooltipStyle.transform = 'translate(-50%, 0)';
    } else if (position === 'left') {
      tooltipStyle.top = `${coords.top + coords.height / 2}px`;
      tooltipStyle.left = `${coords.left - OFFSET}px`;
      tooltipStyle.transform = 'translate(-100%, -50%)';
    } else if (position === 'right') {
      tooltipStyle.top = `${coords.top + coords.height / 2}px`;
      tooltipStyle.left = `${coords.right + OFFSET}px`;
      tooltipStyle.transform = 'translate(0, -50%)';
    }

    return createPortal(
      <div
        id={tooltipId}
        className={`hint-portal-tooltip position-${position}`}
        style={tooltipStyle}
        role="tooltip"
      >
        <div className="hint-portal-content">{text}</div>
        <div className="hint-portal-arrow" />
      </div>,
      document.body
    );
  };

  return (
    <>
      <span
        ref={triggerRef}
        className={`hint-container ${className}`}
        tabIndex={0}
        role="button"
        aria-describedby={tooltipId}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onFocus={handleMouseEnter}
        onBlur={handleMouseLeave}
        onKeyDown={handleKeyDown}
      >
        {children || <HelpCircle size={size} className="hint-icon" aria-hidden="true" />}
      </span>
      {renderTooltip()}
    </>
  );
};

export default Hint;
