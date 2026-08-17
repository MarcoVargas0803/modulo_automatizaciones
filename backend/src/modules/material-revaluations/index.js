const express = require('express');

const router = express.Router();

router.use(require('./material-revaluations-dashboard.routes'));
router.use(require('./material-revaluations.routes'));

module.exports = router;
