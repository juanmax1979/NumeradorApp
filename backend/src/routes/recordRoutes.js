const express = require("express");
const {
  getNextNumber,
  listRecords,
  exportRecordsExcel,
  createRecord,
  updateRecord,
  toggleRemitido,
  annulRecord,
  deleteRecord,
} = require("../controllers/recordController");
const { authRequired, requireRole } = require("../middleware/auth");
const { validateBody, validateQuery } = require("../middleware/validate");
const {
  createRecordSchema,
  updateRecordSchema,
  listRecordsQuerySchema,
  exportRecordsQuerySchema,
} = require("../validations/schemas");

const router = express.Router();

router.use(authRequired);
router.get("/", validateQuery(listRecordsQuerySchema), listRecords);
router.get("/export.xlsx", validateQuery(exportRecordsQuerySchema), exportRecordsExcel);
router.get("/next-number/:tipo", getNextNumber);
router.post("/", validateBody(createRecordSchema), createRecord);
router.put("/:id", validateBody(updateRecordSchema), updateRecord);
router.post("/:id/toggle-remitido", toggleRemitido);
router.post("/:id/annul", annulRecord);
router.delete("/:id", requireRole("admin"), deleteRecord);

module.exports = router;
