const express = require("express");
const pool = require("../../shared/db/pool");
const { requireAuth } = require("../../shared/middlewares/auth.middleware");
const { buildErrorResponse } = require("../../shared/utils/errorResponse");

const router = express.Router();

router.get("/db/health", requireAuth, async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW() AS current_time");

    res.json({
      success: true,
      message: "Conexion a PostgreSQL exitosa",
      database_time: result.rows[0].current_time,
    });
  } catch (error) {
    res
      .status(500)
      .json(buildErrorResponse("Error al conectar con PostgreSQL", error));
  }
});

module.exports = router;
