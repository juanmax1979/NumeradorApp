const express = require("express");
const { authRequired } = require("../middleware/auth");
const {
  runSigiUsuarioPorDni,
  runSigiExpediente,
} = require("../controllers/sigiController");

const router = express.Router();

router.use(authRequired);

router.post("/usuario", runSigiUsuarioPorDni);
router.post("/expediente", runSigiExpediente);

// aliases temporales para no romper integraciones previas
router.post("/sp1", runSigiUsuarioPorDni);
router.post("/sp2", runSigiExpediente);

module.exports = router;

