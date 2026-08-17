const express = require('express');

const router = express.Router();

router.get('/health', (req, res) => {
    res.json({
        success: true,
        message: 'ModuloReportes API funcionando correctamente',
        timestamp: new Date().toISOString(),
    });
});

module.exports = router;