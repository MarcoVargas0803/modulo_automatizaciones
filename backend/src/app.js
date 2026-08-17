const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const env = require("./shared/config/env");

// Cada módulo expone un router agregado en su index.js. Ver docs/ARCHITECTURE.md.
const platformRoutes = require('./modules/platform');
const authRoutes = require('./modules/auth');
const executionsRoutes = require('./modules/executions');
const internationalPurchasesRoutes = require('./modules/international-purchases');
const materialRevaluationsRoutes = require('./modules/material-revaluations');
const adminRoutes = require('./modules/admin');
const { notFoundHandler, globalErrorHandler } = require('./shared/middlewares/error.middleware');

const app = express();

app.set("trust proxy", 1);

const isProduction = env.nodeEnv === "production";

app.use(
    helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                baseUri: ["'self'"],
                fontSrc: ["'self'", "https:", "data:"],
                formAction: ["'self'"],
                frameAncestors: ["'self'"],
                // Los tiles del mapa de embarques son <img>, asi que sin estos dos
                // origenes el mapa sale en GRIS y sin un solo error de JavaScript:
                // solo violaciones de CSP en consola. OpenStreetMap sirve el tema
                // claro y CARTO --que reestiliza datos de OSM-- el oscuro.
                //
                // Ambos exigen atribucion por licencia (ODbL de OSM y terminos de
                // CARTO): esta en ShipmentMap.jsx y no es decorativa.
                //
                // Aviso vigente: el servidor publico de OSM es un servicio
                // comunitario que desaconseja el uso comercial sostenido. Con el
                // volumen actual no hay problema practico; si el portal crece,
                // toca proveedor con contrato.
                imgSrc: [
                    "'self'",
                    "data:",
                    "https://*.tile.openstreetmap.org",
                    "https://*.basemaps.cartocdn.com",
                ],
                objectSrc: ["'none'"],
                // El hash autoriza el unico <script> inline de index.html (fija el
                // tema antes del primer render para evitar el parpadeo). Si ese
                // script cambia aunque sea un espacio, hay que regenerar el hash.
                scriptSrc: ["'self'", "'sha256-+NK0HYIhIZw2x2n88nVNSWV6FoWYd2/nG8B9mJC8K7A='"],
                scriptSrcAttr: ["'none'"],
                styleSrc: ["'self'", "https:", "'unsafe-inline'"],
                upgradeInsecureRequests: null,
            },
        },
        hsts: isProduction,
    })
);
app.use(cors({
    origin: env.frontendOrigins,
    credentials: true,
}));

app.use(express.json({ limit: "512kb" }));
app.use(cookieParser());
app.use(morgan(isProduction ? 'combined' : 'dev'));

app.use('/api', platformRoutes);
app.use('/api', authRoutes);
app.use('/api', executionsRoutes);
app.use('/api', internationalPurchasesRoutes);
app.use('/api', materialRevaluationsRoutes);
app.use('/api', adminRoutes);

// Ningun modulo de este portal sube archivos, asi que no se sirve /uploads. El
// portal completo lo hacia por las evidencias de mantenimiento y los
// comprobantes de pago; si algun dia vuelve un modulo con subida, el bloque va
// AQUI: con requireAuth y antes del catch-all de la SPA, que de lo contrario
// devuelve index.html en lugar del archivo.
const frontendPath = path.join(__dirname, '..', 'public');

app.use(express.static(frontendPath));

app.use((req, res, next) => {
    if (req.path.startsWith('/api')) {
        return next();
    }

    return res.sendFile(path.join(frontendPath, 'index.html'));
});

app.use(notFoundHandler);
app.use(globalErrorHandler);

module.exports = app;
