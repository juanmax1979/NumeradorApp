const express = require("express");
const {
  login,
  changeOwnPassword,
  logout,
  refresh,
} = require("../controllers/authController");
const { authRequired } = require("../middleware/auth");
const { validateBody } = require("../middleware/validate");
const {
  loginSchema,
  changePasswordSchema,
} = require("../validations/schemas");

const router = express.Router();

router.post("/login", validateBody(loginSchema), login);
router.post("/refresh", refresh);
router.post("/change-password", authRequired, validateBody(changePasswordSchema), changeOwnPassword);
router.post("/logout", authRequired, logout);

module.exports = router;
