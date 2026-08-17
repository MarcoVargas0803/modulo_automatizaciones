const express = require('express');

const router = express.Router();

// Ejecuciones de n8n y todo lo que se deriva de ellas: tablero, calidad de
// datos y exportación CSV. Comparten los utils/ de este módulo.
router.use(require('./data-quality.routes'));
router.use(require('./executions.routes'));
router.use(require('./dashboard.routes'));
router.use(require('./export.routes'));

module.exports = router;
