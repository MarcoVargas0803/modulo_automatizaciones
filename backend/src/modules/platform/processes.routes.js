const express = require("express");
const pool = require("../../shared/db/pool");
const { requireAuth } = require("../../shared/middlewares/auth.middleware");
const { buildErrorResponse } = require("../../shared/utils/errorResponse");

const router = express.Router();

router.get("/processes", requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;

    const result = await pool.query(
      ` SELECT
            process_code,
            process_name,
            description,
            can_view,
            can_export
        FROM audit_portal.v_user_process_access_effective
        WHERE user_id = $1
        ORDER BY process_name;`,
      [userId],
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    res
      .status(500)
      .json(
        buildErrorResponse(
          "Error al consultar los procesos del usuario",
          error,
        ),
      );
  }
});

module.exports = router;
