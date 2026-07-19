const express = require("express");
const { getPayOSPaymentStatus, handlePayOSWebhook } = require("../controllers/payosController");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

/**
 * @swagger
 * /payos/webhook:
 *   post:
 *     summary: Unified signed payOS webhook for orders and AI packages
 *     tags: [Payment]
 *     responses:
 *       200:
 *         description: Webhook acknowledged
 *       400:
 *         description: Invalid signature or amount
 *
 * /payos/payment-status/{orderCode}:
 *   get:
 *     summary: Reconcile and get any payOS payment by order code
 *     tags: [Payment]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderCode
 *         required: true
 *         schema:
 *           type: integer
 *           format: int64
 *     responses:
 *       200:
 *         description: Current canonical payment status
 *       403:
 *         description: Payment belongs to another user
 *       404:
 *         description: Payment not found
 */

router.post("/webhook", handlePayOSWebhook);
router.get("/payment-status/:orderCode", authMiddleware, getPayOSPaymentStatus);

module.exports = router;
