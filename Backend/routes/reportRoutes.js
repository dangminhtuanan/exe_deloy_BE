const express = require("express");
const { getRevenueReport } = require("../controllers/reportController");
const authMiddleware = require("../middleware/authMiddleware");
const { requireRoles } = require("../middleware/roleMiddleware");

const router = express.Router();
const adminOnly = [authMiddleware, requireRoles("admin")];

router.get("/revenue", adminOnly, getRevenueReport);

module.exports = router;
