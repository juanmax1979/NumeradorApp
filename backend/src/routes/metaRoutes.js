const express = require("express");
const categorias = require("../data/categorias.json");
const { authRequired } = require("../middleware/auth");
const { runQuery } = require("../config/db");

const router = express.Router();

router.get("/health", (req, res) => {
  res.json({ ok: true, service: "numerador-backend" });
});

router.get("/categorias", authRequired, (req, res) => {
  res.json(categorias);
});

router.get("/dependencias", authRequired, async (req, res, next) => {
  try {
    const rs = await runQuery(
      `SELECT id, nombre, activa,
              cod_dep_sigi AS codDepSigi
       FROM dbo.dependencias ORDER BY nombre`
    );
    res.json(rs.recordset);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
