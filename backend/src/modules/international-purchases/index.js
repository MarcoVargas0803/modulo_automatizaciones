const express = require('express');

const router = express.Router();

// Las rutas PUBLICAS van primero a proposito. No hay colision real —todas
// cuelgan de /international-purchases/public/— pero se montan arriba para que
// al abrir este archivo quede a la vista que el modulo expone un tramo sin
// sesion ni CSRF, autenticado solo con el token del enlace del forwarder.
router.use(require('./international-purchases-public.routes'));

router.use(require('./international-purchases-dashboard.routes'));
router.use(require('./international-purchases-invites.routes'));
router.use(require('./international-purchases.routes'));

module.exports = router;
