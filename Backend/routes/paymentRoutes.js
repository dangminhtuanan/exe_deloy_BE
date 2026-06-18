const express = require("express");
const {
  createPayment,
  getMyPayments,
  getPaymentById,
  getPayments,
  updatePaymentStatus,
} = require("../controllers/paymentController");
const authMiddleware = require("../middleware/authMiddleware");
const { requireRoles } = require("../middleware/roleMiddleware");

const router = express.Router();
const staffOnly = [authMiddleware, requireRoles("admin", "manager", "staff")];

router.post("/", authMiddleware, createPayment);
router.get("/my", authMiddleware, getMyPayments);
router.get("/", staffOnly, getPayments);
router.get("/:id", authMiddleware, getPaymentById);
router.patch("/:id/status", staffOnly, updatePaymentStatus);

module.exports = router;
