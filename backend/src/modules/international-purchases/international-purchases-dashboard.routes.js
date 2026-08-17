const express = require("express");
const pool = require("../../shared/db/pool");
const { requireAuth } = require("../../shared/middlewares/auth.middleware");
const { requireProcess } = require("../../shared/middlewares/access.middleware");
const { buildErrorResponse } = require("../../shared/utils/errorResponse");

const router = express.Router();

const PROCESS_CODE = "international_purchases";

// A diferencia de las otras 7 rutas del módulo —que solo exigen sesión, la
// trampa documentada en backend-specific-rules/trampas-conocidas.md— esta sí
// aplica el gate por proceso. Antes de desplegar hay que confirmar en
// audit_portal.user_process_access que quienes usan el módulo tienen
// 'international_purchases' asignado, o verán un 403 solo en el Dashboard.
const guard = [requireAuth, requireProcess(PROCESS_CODE)];

// Cuántas filas caben en cada tarjeta del Dashboard. Son presentación, no dato:
// por eso siguen aquí y no dentro de la vista.
const CARRIER_LIMIT = 8;
const WARNING_LIMIT = 10;
const ROUTE_LIMIT = 8;
const PORT_LIMIT = 8;
const SUPPLIER_LIMIT = 10;

// Techo de puntos del mapa. Cada punto viaja en el mismo JSON que el resto del
// Dashboard: hoy son 5 filas y no aprieta, pero un mapa sin límite es un
// endpoint sin límite. Si algún día se alcanza, la respuesta a dar es paginar o
// agrupar por zona, no subir el número.
const MAP_POINTS_LIMIT = 200;

// KPIs del proceso de compras internacionales.
//
// Los catorce bloques viven en vistas del esquema international_purchases; aquí
// queda el ensamblado JSON, el orden y los límites. La ventana de 30 días de
// actividad de tracking pasó al DDL de su vista, y la constante
// TRACKING_WINDOW_DAYS se borró para no dejar dos fuentes de verdad. Los
// umbrales de puntualidad (0/3/7 días) y las 24 h de obsolescencia siguen el
// mismo criterio: viven en el DDL, no aquí.
//
// El bloque de ETA no calcula nada: v_shipments_portal ya deriva eta_status
// (SIN_ETA / ETA_VENCIDA / ETA_HOY / ETA_PROXIMA / ETA_FUTURA) y days_to_eta, y
// esa es la métrica operativa central del módulo.
//
// Los seis bloques añadidos por schema-international-purchases-indicators.sql
// explotan el payload de SafeCube que ya se guardaba entero y no leía nadie.
// DOS DE ELLOS TIENEN COBERTURA PARCIAL: `routes` y `by_port` cuelgan de
// v_shipment_latest_payload, que solo ve embarques con al menos un cambio de
// fecha registrado. El denominador para rotularlos honestamente viaja en
// `data_quality` (con_payload / sin_payload) — el frontend lo necesita, no es
// opcional.
//
// Ampliar este endpoint no penaliza a los demás procesos: el Dashboard solo
// dispara el del proceso seleccionado (useDashboardData.js).
router.get(
  "/international-purchases/dashboard-summary",
  ...guard,
  async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT
        (SELECT row_to_json(totales)
           FROM international_purchases.v_dashboard_totals_web totales) AS totals,
        (SELECT COALESCE(json_agg(row_to_json(eta_buckets) ORDER BY eta_buckets.eta_status), '[]'::json)
           FROM international_purchases.v_dashboard_eta_buckets_web eta_buckets) AS eta_buckets,
        (SELECT COALESCE(json_agg(row_to_json(por_estado) ORDER BY por_estado.shipment_status), '[]'::json)
           FROM international_purchases.v_dashboard_by_status_web por_estado) AS by_status,
        (SELECT COALESCE(json_agg(row_to_json(por_naviera) ORDER BY por_naviera.total DESC), '[]'::json)
           FROM (
             SELECT carrier, total, arribados, desviacion_dias
             FROM international_purchases.v_dashboard_by_carrier_web
             ORDER BY total DESC
             LIMIT $1
           ) por_naviera) AS by_carrier,
        (SELECT COALESCE(json_agg(row_to_json(alertas) ORDER BY alertas.total DESC), '[]'::json)
           FROM (
             SELECT code, label, severity, total
             FROM international_purchases.v_dashboard_warnings_web
             ORDER BY total DESC
             LIMIT $2
           ) alertas) AS warnings,
        (SELECT COALESCE(json_agg(row_to_json(actividad_tracking) ORDER BY actividad_tracking.field_name), '[]'::json)
           FROM international_purchases.v_dashboard_tracking_activity_web actividad_tracking) AS tracking_activity,
        (SELECT row_to_json(puntualidad)
           FROM international_purchases.v_dashboard_punctuality_web puntualidad) AS punctuality,
        (SELECT row_to_json(transito)
           FROM international_purchases.v_dashboard_transit_web transito) AS transit,
        (SELECT row_to_json(calidad)
           FROM international_purchases.v_dashboard_data_quality_web calidad) AS data_quality,
        (SELECT COALESCE(json_agg(row_to_json(por_proveedor) ORDER BY por_proveedor.total DESC), '[]'::json)
           FROM (
             SELECT supplier_name, total, arribados, contenedores, desviacion_dias, pct_a_tiempo
             FROM international_purchases.v_dashboard_punctuality_by_supplier_web
             ORDER BY total DESC
             LIMIT $3
           ) por_proveedor) AS punctuality_by_supplier,
        (SELECT COALESCE(json_agg(row_to_json(corredores) ORDER BY corredores.total DESC), '[]'::json)
           FROM (
             SELECT corredor, pol_locode, pod_locode, total, contenedores, transito_dias, desviacion_dias
             FROM international_purchases.v_dashboard_routes_web
             ORDER BY total DESC
             LIMIT $4
           ) corredores) AS routes,
        (SELECT COALESCE(json_agg(row_to_json(puertos) ORDER BY puertos.total DESC), '[]'::json)
           FROM (
             SELECT pod_locode, pod_name, pod_country, total, contenedores, arribados
             FROM international_purchases.v_dashboard_by_port_web
             ORDER BY total DESC
             LIMIT $5
           ) puertos) AS by_port,
        (SELECT COALESCE(json_agg(row_to_json(mapa) ORDER BY mapa.posicion_dias), '[]'::json)
           FROM (
             SELECT shipment_id, tracking_key, shipment_status, carrier, supplier_name,
                    container_count, eta, eta_status, lat, lng, posicion_origen,
                    vessel_name, pol_locode, pol_name, pod_locode, pod_name,
                    posicion_de, posicion_dias
             FROM international_purchases.v_shipment_map_points_web
             ORDER BY posicion_dias
             LIMIT $6
           ) mapa) AS map_points,
        (SELECT row_to_json(cobertura)
           FROM (
             SELECT
               (SELECT count(*)::integer
                  FROM international_purchases.v_shipment_map_points_web) AS con_posicion,
               (SELECT count(*)::integer
                  FROM audit_portal.v_international_purchases_shipments_web
                 WHERE review_status <> 'DISCARDED'
                   AND shipment_status IN ('IN_TRANSIT', 'PLANNED')) AS activos
           ) cobertura) AS map_coverage;
      `,
        [
          CARRIER_LIMIT,
          WARNING_LIMIT,
          SUPPLIER_LIMIT,
          ROUTE_LIMIT,
          PORT_LIMIT,
          MAP_POINTS_LIMIT,
        ],
      );

      res.json({
        success: true,
        data: result.rows[0],
      });
    } catch (error) {
      // Sin esta línea el fallo es invisible: buildErrorResponse oculta
      // error.message en producción y este router no logueaba. Es el mecanismo
      // exacto que dejó sin rastro el 42703 de agosto de 2026 —ni en la
      // respuesta ni en los logs— documentado en
      // schema-international-purchases-views.sql.
      console.error("[international-purchases/dashboard-summary]", error);

      res
        .status(500)
        .json(
          buildErrorResponse(
            "Error al consultar los indicadores de compras internacionales",
            error,
          ),
        );
    }
  },
);

module.exports = router;
