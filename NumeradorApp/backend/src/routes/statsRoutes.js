const express = require("express");
const { getStats } = require("../controllers/statsController");
const { authRequired } = require("../middleware/auth");

const router = express.Router();

router.use(authRequired);
router.get("/", getStats);

module.exports = router;
