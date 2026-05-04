const express = require("express");
const { authRequired } = require("../middleware/auth");
const {
  runSigiUsuarioPorDni,
  runSigiExpediente,
  getSigiAllowedCodDepTokens,
  getMisDependenciasSigi,
} = require("../controllers/sigiController");

const router = express.Router();

router.use(authRequired);

router.get("/mis-dependencias", getMisDependenciasSigi);
router.get("/allowed-cod-dep-tokens", getSigiAllowedCodDepTokens);
router.post("/usuario", runSigiUsuarioPorDni);
router.post("/expediente", runSigiExpediente);

// aliases temporales para no romper integraciones previas
router.post("/sp1", runSigiUsuarioPorDni);
router.post("/sp2", runSigiExpediente);

module.exports = router;

