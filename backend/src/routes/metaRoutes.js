const express = require("express");
const categorias = require("../data/categorias.json");
const { authRequired } = require("../middleware/auth");
const { runQuery } = require("../config/db");
const { getAnnulMaxHoursAfterCreate } = require("../config/appLimits");

const router = express.Router();

router.get("/health", (req, res) => {
  res.json({ ok: true, service: "numerador-backend" });
});

router.get("/categorias", authRequired, (req, res) => {
  res.json(categorias);
});

router.get("/limits", authRequired, (req, res) => {
  res.json({
    annulMaxHoursAfterCreate: getAnnulMaxHoursAfterCreate(),
  });
});

router.get("/dependencias", authRequired, async (req, res, next) => {
  try {
    const rs = await runQuery(
      `SELECT id, nombre, activa,
              fuero,
              sistema_origen AS sistemaOrigen,
              cod_dep_sigi AS codDepSigi,
              COALESCE(NULLIF(LTRIM(RTRIM(cod_dep_externo)), ''), cod_dep_sigi) AS codDepExterno
       FROM dbo.dependencias
       WHERE activa = 1
       ORDER BY nombre`
    );
    res.json(rs.recordset);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
