const express = require("express");
const { getRevenueReport } = require("../controllers/reportController");
const { getVisitorReport } = require("../controllers/analyticsController");
const authMiddleware = require("../middleware/authMiddleware");
const { requireRoles } = require("../middleware/roleMiddleware");

const router = express.Router();
const reportManagersOnly = [authMiddleware, requireRoles("admin", "manager")];

router.get("/revenue", reportManagersOnly, getRevenueReport);
router.get("/visitors", reportManagersOnly, getVisitorReport);

module.exports = router;
