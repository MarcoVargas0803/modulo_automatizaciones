const express = require('express');

const router = express.Router();

router.use(require('./auth.routes'));

module.exports = router;
