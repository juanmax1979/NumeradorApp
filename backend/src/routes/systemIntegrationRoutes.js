const express = require("express");
const { authRequired } = require("../middleware/auth");
const {
  runUsuarioBySystem,
  runExpedienteBySystem,
  getAllowedTokensBySystem,
  getSessionIntegrationContext,
} = require("../controllers/systemIntegrationController");

const router = express.Router();

router.use(authRequired);

// Sistema de la sesión (dependencia activa).
router.get("/context", getSessionIntegrationContext);
router.get("/allowed-cod-dep-tokens", getAllowedTokensBySystem);
router.post("/usuario", runUsuarioBySystem);
router.post("/expediente", runExpedienteBySystem);

// Override explícito por sistema para pruebas o transición.
router.get("/:sistema/allowed-cod-dep-tokens", getAllowedTokensBySystem);
router.post("/:sistema/usuario", runUsuarioBySystem);
router.post("/:sistema/expediente", runExpedienteBySystem);

module.exports = router;
