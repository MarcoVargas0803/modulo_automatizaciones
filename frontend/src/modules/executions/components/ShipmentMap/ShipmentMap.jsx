import React, { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { Badge } from '@/shared/components/Badge/Badge';
import { formatDate } from '@/shared/utils/formatters';
// CSS de la propia librería, no del componente. Sin él, Leaflet pinta los tiles
// descolocados en cascada. Es la excepción justificada a la regla «un .css por
// componente en su misma carpeta»: eso es `ShipmentMap.css`, que sí existe.
import 'leaflet/dist/leaflet.css';
import './ShipmentMap.css';

/**
 * Capas de teselas. Las dos sirven datos de OpenStreetMap; CARTO los reestiliza
 * para tema oscuro, que OSM no ofrece.
 *
 * Los dos dominios están autorizados en el `imgSrc` del CSP
 * (`backend/src/app.js`). Añadir un proveedor aquí sin tocar allí deja el mapa
 * en gris sin ningún error de JavaScript.
 *
 * La atribución es obligatoria por licencia (ODbL de OSM, términos de CARTO).
 * No es decorativa: quitarla incumple.
 */
const TILE_LAYERS = {
  light: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
  dark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
  },
};

/** Mismo vocabulario de ETA que el listado y las gráficas del Dashboard. */
const ETA_LABELS = {
  ETA_VENCIDA: 'ETA vencida',
  ETA_HOY: 'Llega hoy',
  ETA_PROXIMA: 'Próximos 7 días',
  ETA_FUTURA: 'Más adelante',
  SIN_ETA: 'Sin ETA',
};

const ETA_VARIANTS = {
  ETA_VENCIDA: 'error',
  ETA_HOY: 'warning',
  ETA_PROXIMA: 'info',
  ETA_FUTURA: 'success',
  SIN_ETA: 'default',
};

/** Color del pin, con los mismos tokens que la gráfica de estado de ETA. */
const PIN_COLORS = {
  ETA_VENCIDA: 'var(--color-error)',
  ETA_HOY: 'var(--color-warning)',
  ETA_PROXIMA: 'var(--color-info)',
  ETA_FUTURA: 'var(--color-success)',
  SIN_ETA: 'var(--color-muted-text)',
};

/**
 * Marcador como `divIcon` con SVG inline, y no el icono por defecto de Leaflet.
 *
 * `L.Icon.Default` resuelve las rutas de sus PNG relativas al CSS; con un
 * bundler como Vite esas rutas dan 404 y **los marcadores salen invisibles sin
 * lanzar ningún error**. Es la trampa clásica de Leaflet.
 *
 * Hacerlo con `divIcon` mata tres pájaros: evita el bug, permite colorear el pin
 * con los tokens del sistema —así el mapa habla el mismo idioma que las
 * gráficas— y no añade ninguna imagen que el CSP tenga que autorizar.
 *
 * El contorno discontinuo marca las posiciones estimadas: pintarlas igual que
 * una posición AIS medida sería vender como dato algo que es una inferencia.
 */
function buildPinIcon(etaStatus, isEstimated) {
  const color = PIN_COLORS[etaStatus] || PIN_COLORS.SIN_ETA;

  return L.divIcon({
    className: 'shipment-pin',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    popupAnchor: [0, -12],
    html: `
      <span class="shipment-pin-dot${isEstimated ? ' is-estimated' : ''}"
            style="--pin-color: ${color}"></span>
    `,
  });
}

/**
 * Lee el tema activo y se mantiene al día.
 *
 * El tema no tiene contexto ni hook: se escribe en `data-theme` del
 * `<html>` desde `DashboardLayout.jsx` y `Login.jsx`, cada uno con su `useState`
 * local. Sin nada a lo que suscribirse, un componente que lea el atributo una
 * sola vez se quedaría con la capa equivocada cuando el usuario cambia de tema,
 * así que hace falta observar el DOM.
 *
 * Deuda que esto destapa y que NO se arregla aquí: el tema tiene dos fuentes de
 * verdad duplicadas. Lo correcto sería un `useTheme` en `shared/hooks/` que
 * absorbiera las dos, pero eso toca `DashboardLayout.jsx` y `Login.jsx`.
 */
function useIsDarkTheme() {
  const [isDark, setIsDark] = useState(
    () => document.documentElement.getAttribute('data-theme') === 'dark',
  );

  useEffect(() => {
    const target = document.documentElement;
    const observer = new MutationObserver(() => {
      setIsDark(target.getAttribute('data-theme') === 'dark');
    });

    observer.observe(target, { attributes: true, attributeFilter: ['data-theme'] });

    return () => observer.disconnect();
  }, []);

  return isDark;
}

/** Antigüedad de la posición en texto corto. */
function formatAge(days) {
  const value = Number(days);

  if (!Number.isFinite(value)) return 'sin fecha';
  if (value <= 0) return 'hoy';
  if (value === 1) return 'hace 1 día';

  return `hace ${value} días`;
}

/**
 * ShipmentMap — Mapa de la última posición conocida de cada embarque activo.
 *
 * Se envuelve fuera en `ChartCard`, que ya resuelve los cuatro estados
 * (cargando, error, vacío, contenido) y aporta el borde y la tipografía de
 * sección. Aquí solo vive el mapa.
 *
 * ── Trampas ──────────────────────────────────────────────────────────────────
 * - **Sin alto explícito el mapa mide 0 px.** Igual que `ChartCard`: dentro de
 *   un flex en columna, un alto porcentual colapsa. El alto va en píxeles y lo
 *   fija `.shipment-map` en su CSS.
 * - **La posición NO es de ahora.** Es la última que trajo el tracking, y cada
 *   popup dice su antigüedad. Mientras n8n no escriba
 *   `shipments.last_tracking_payload`, la vista cae al historial —que solo
 *   registra cambios de fecha— y las posiciones son de semanas atrás.
 * - **`scrollWheelZoom` va desactivado a propósito.** El mapa está embebido en
 *   una página con scroll; capturar la rueda secuestraría el desplazamiento.
 * - **No todos los embarques activos salen.** Los que no tienen coordenada no
 *   se pintan; el conteo lo da `coverage` y se muestra en el subtítulo.
 *
 * @param {object[]} points - Filas de `v_shipment_map_points_web`.
 * @param {string}   [className] - Clases extra. (default: '')
 *
 * @example
 * <ChartCard title="Ubicación de los embarques" subtitle={cobertura}>
 *   <ShipmentMap points={section.map.points} />
 * </ChartCard>
 */
export function ShipmentMap({ points = [], className = '' }) {
  const isDark = useIsDarkTheme();
  const layer = isDark ? TILE_LAYERS.dark : TILE_LAYERS.light;

  // `pg` devuelve numeric como cadena; el backend ya castea a double precision,
  // pero la coerción se repite aquí porque un `position` con cadenas coloca mal
  // el pin en vez de fallar. Es la misma trampa que documenta `chartTheme.js`.
  const markers = useMemo(
    () => points
      .map((point) => ({
        ...point,
        lat: Number(point.lat),
        lng: Number(point.lng),
      }))
      .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng)),
    [points],
  );

  // Centro por el promedio de los puntos, para no abrir siempre en el Atlántico
  // cuando toda la carga viene de Asia. Con el mapa vacío, vista mundial.
  const center = useMemo(() => {
    if (markers.length === 0) return [20, 0];

    const total = markers.reduce(
      (acc, point) => ({ lat: acc.lat + point.lat, lng: acc.lng + point.lng }),
      { lat: 0, lng: 0 },
    );

    return [total.lat / markers.length, total.lng / markers.length];
  }, [markers]);

  return (
    <MapContainer
      // La `key` fuerza el remontaje al cambiar de tema. Leaflet cachea las
      // teselas ya pintadas y, sin esto, la capa nueva convive con la vieja
      // hasta que el usuario hace pan o zoom.
      key={isDark ? 'dark' : 'light'}
      center={center}
      zoom={2}
      minZoom={2}
      scrollWheelZoom={false}
      worldCopyJump
      className={`shipment-map ${className}`}
    >
      <TileLayer attribution={layer.attribution} url={layer.url} />

      {markers.map((point) => (
        <Marker
          key={point.shipment_id}
          position={[point.lat, point.lng]}
          icon={buildPinIcon(point.eta_status, point.posicion_origen !== 'AIS')}
        >
          <Popup>
            <div className="shipment-popup">
              <p className="shipment-popup-title data-text">{point.tracking_key}</p>

              <Badge variant={ETA_VARIANTS[point.eta_status] || 'default'} size="sm">
                {ETA_LABELS[point.eta_status] || 'Sin ETA'}
              </Badge>

              <dl className="shipment-popup-grid">
                {point.supplier_name && (
                  <>
                    <dt>Proveedor</dt>
                    <dd>{point.supplier_name}</dd>
                  </>
                )}
                {point.carrier && (
                  <>
                    <dt>Naviera</dt>
                    <dd>{point.carrier}</dd>
                  </>
                )}
                {point.vessel_name && (
                  <>
                    <dt>Buque</dt>
                    <dd>{point.vessel_name}</dd>
                  </>
                )}
                {/* La fecha va junto al Badge de estado y antes de la ruta: el
                    semáforo dice «vencida», pero para decidir hace falta el
                    día. Mismo formato que la ficha de detalle. */}
                <dt>ETA</dt>
                <dd><strong>{formatDate(point.eta)}</strong></dd>
                <dt>Ruta</dt>
                <dd>
                  {point.pol_locode || '?'} → {point.pod_locode || '?'}
                </dd>
                {point.container_count > 0 && (
                  <>
                    <dt>Contenedores</dt>
                    <dd>{point.container_count}</dd>
                  </>
                )}
                <dt>Posición</dt>
                {/* Origen y antigüedad juntos y siempre visibles: son lo que
                    separa un dato medido de una estimación de hace semanas. */}
                <dd>
                  {point.posicion_origen === 'AIS' ? 'AIS del buque' : 'Estimada'}
                  {', '}
                  {formatAge(point.posicion_dias)}
                </dd>
              </dl>

              {/* `Link` del router y no un <a>: un href suelto recargaría la
                  SPA entera y perdería el estado del Dashboard. El popup se
                  renderiza por portal, pero dentro del árbol de React, así que
                  el contexto del router sigue disponible.

                  No hay ruta de detalle por embarque —el detalle es un modal
                  con estado local—, así que se enlaza al listado filtrado por
                  `search`, que es un parámetro que ya existe. */}
              <RouterLink
                className="action-link"
                to={`/international-purchases?search=${encodeURIComponent(point.tracking_key)}`}
              >
                Ver embarque
              </RouterLink>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
