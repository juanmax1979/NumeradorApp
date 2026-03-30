const express = require("express");
const {
  listUsers,
  resetPassword,
  updateDependencia,
} = require("../controllers/userController");
const { authRequired, requireRole } = require("../middleware/auth");
const { validateBody } = require("../middleware/validate");
const {
  resetPasswordSchema,
  updateDependenciaSchema,
} = require("../validations/schemas");

const router = express.Router();

router.use(authRequired, requireRole("admin"));
router.get("/", listUsers);
router.put("/:nombre/password", validateBody(resetPasswordSchema), resetPassword);
router.put("/:nombre/dependencia", validateBody(updateDependenciaSchema), updateDependencia);

module.exports = router;
