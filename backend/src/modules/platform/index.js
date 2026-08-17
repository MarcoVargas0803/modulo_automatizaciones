const express = require('express');

const router = express.Router();

// Salud del servicio y catálogo de procesos accesibles al usuario.
router.use(require('./health.routes'));
router.use(require('./db.routes'));
router.use(require('./processes.routes'));

module.exports = router;
