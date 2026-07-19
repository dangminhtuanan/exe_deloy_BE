const express = require("express");
const {
  cancelMyOrder,
  createOrder,
  createPayOSCheckout,
  getPaymentStatusByOrderCode,
  getMyOrders,
  getOrderById,
  getOrders,
  updateOrderStatus,
} = require("../controllers/orderController");
const authMiddleware = require("../middleware/authMiddleware");
const { requireRoles } = require("../middleware/roleMiddleware");

const router = express.Router();
const staffOnly = [authMiddleware, requireRoles("admin", "manager", "staff")];

router.post("/", authMiddleware, createOrder);
router.post("/checkout", authMiddleware, createPayOSCheckout);
router.get("/my", authMiddleware, getMyOrders);
router.get("/payment-status/:orderCode", authMiddleware, getPaymentStatusByOrderCode);
router.get("/", staffOnly, getOrders);
router.get("/:id", authMiddleware, getOrderById);
router.patch("/:id/status", staffOnly, updateOrderStatus);
router.patch("/:id/cancel", authMiddleware, cancelMyOrder);

module.exports = router;
