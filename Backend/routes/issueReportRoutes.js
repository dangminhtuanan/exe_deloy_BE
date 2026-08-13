const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const { requireRoles } = require("../middleware/roleMiddleware");
const { createIssueReport, getMyIssueReports, getAllIssueReports, updateIssueReport } = require("../controllers/issueReportController");

const router = express.Router();
router.post("/", authMiddleware, createIssueReport);
router.get("/my", authMiddleware, getMyIssueReports);
router.get("/admin", authMiddleware, requireRoles("admin"), getAllIssueReports);
router.patch("/:id", authMiddleware, requireRoles("admin"), updateIssueReport);

module.exports = router;
