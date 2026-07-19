/**
 * @swagger
 * tags:
 *   - name: AI Packages
 *     description: AI package purchase and credit management
 * 
 * components:
 *   schemas:
 *     AIPackage:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           example: 662a11111111111111111111
 *         name:
 *           type: string
 *           example: Starter Package
 *         description:
 *           type: string
 *           example: Basic AI features access
 *         price:
 *           type: number
 *           example: 50000
 *         credits:
 *           type: number
 *           example: 10
 *         features:
 *           type: array
 *           items:
 *             type: string
 *           example: ["Try-On", "Mix & Match"]
 *         duration:
 *           type: string
 *           enum: [one-time, monthly, yearly]
 *           example: one-time
 *         isTrial:
 *           type: boolean
 *           description: Each account can purchase this package only once
 *           example: false
 *         active:
 *           type: boolean
 *           example: true
 *         displayOrder:
 *           type: number
 *           example: 0
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 * 
 *     AITransaction:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         user:
 *           type: string
 *           description: User ID
 *         package:
 *           type: string
 *           description: AIPackage ID
 *         amount:
 *           type: number
 *           example: 50000
 *         credits:
 *           type: number
 *           example: 10
 *         provider:
 *           type: string
 *           enum: [cod, momo, vnpay, bank_transfer, stripe, paypal, PAYOS]
 *           example: PAYOS
 *         orderCode:
 *           type: number
 *           example: 1717406400
 *         paymentLinkId:
 *           type: string
 *         checkoutUrl:
 *           type: string
 *         status:
 *           type: string
 *           enum: [PENDING, PAID, CANCELLED, FAILED]
 *           example: PENDING
 *         transactionNo:
 *           type: string
 *         paidAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 * 
 *     AIPackageInput:
 *       type: object
 *       required: [name, price, credits]
 *       properties:
 *         name:
 *           type: string
 *           example: Premium Package
 *         description:
 *           type: string
 *           example: Advanced AI features
 *         price:
 *           type: number
 *           example: 150000
 *         credits:
 *           type: number
 *           example: 50
 *         features:
 *           type: array
 *           items:
 *             type: string
 *           example: ["Try-On", "Mix & Match", "Style Recommendation"]
 *         duration:
 *           type: string
 *           enum: [one-time, monthly, yearly]
 *           example: monthly
 *         isTrial:
 *           type: boolean
 *           example: false
 *         displayOrder:
 *           type: number
 *           example: 1
 * 
 *     PurchaseInput:
 *       type: object
 *       required: [packageId]
 *       properties:
 *         packageId:
 *           type: string
 *           example: 662a11111111111111111111
 * 
 *     UseCreditsInput:
 *       type: object
 *       properties:
 *         credits:
 *           type: number
 *           example: 1
 * 
 *     AddCreditsInput:
 *       type: object
 *       required: [userId, credits]
 *       properties:
 *         userId:
 *           type: string
 *           example: 662a11111111111111111111
 *         credits:
 *           type: number
 *           example: 10
 *         reason:
 *           type: string
 *           example: Promotional offer
 */

/**
 * @swagger
 * /ai-packages/packages:
 *   get:
 *     summary: Get all available AI packages
 *     tags: [AI Packages]
 *     responses:
 *       200:
 *         description: List of available packages
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 packages:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/AIPackage'
 *       500:
 *         description: Server error
 *   post:
 *     summary: Create new AI package - Admin/Manager only
 *     tags: [AI Packages]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AIPackageInput'
 *     responses:
 *       201:
 *         description: Package created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 package:
 *                   $ref: '#/components/schemas/AIPackage'
 *       400:
 *         description: Missing required fields or package name already exists
 *       403:
 *         description: Forbidden - Admin/Manager only
 * 
 * /ai-packages/packages/all:
 *   get:
 *     summary: Get all packages (including inactive) - Admin only
 *     tags: [AI Packages]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of all packages
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin/Manager only
 * 
 * /ai-packages/packages/{id}:
 *   put:
 *     summary: Update AI package - Admin/Manager only
 *     tags: [AI Packages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AIPackageInput'
 *     responses:
 *       200:
 *         description: Package updated successfully
 *       404:
 *         description: Package not found
 *       403:
 *         description: Forbidden - Admin/Manager only
 *   delete:
 *     summary: Delete AI package - Admin/Manager only
 *     tags: [AI Packages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Package deleted successfully
 *       404:
 *         description: Package not found
 *       403:
 *         description: Forbidden - Admin/Manager only
 * 
 * /ai-packages/my/transactions:
 *   get:
 *     summary: Get my AI package transactions
 *     tags: [AI Packages]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of user's transactions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 transactions:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/AITransaction'
 *       401:
 *         description: Unauthorized
 * 
 * /ai-packages/my/balance:
 *   get:
 *     summary: Get my AI credits balance
 *     tags: [AI Packages]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User's credit balance
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 balance:
 *                   type: number
 *                   example: 13
 *                 monthlyAiCredits:
 *                   type: number
 *                   description: Free credits remaining in the current month
 *                   example: 3
 *                 paidAiCredits:
 *                   type: number
 *                   description: Purchased or admin-granted credits that do not expire monthly
 *                   example: 10
 *                 userId:
 *                   type: string
 *                 monthlyGrant:
 *                   type: object
 *                   properties:
 *                     granted:
 *                       type: boolean
 *                       description: True when this request granted the user's monthly credits
 *                     credits:
 *                       type: integer
 *                       example: 3
 *                     period:
 *                       type: string
 *                       example: "2026-07"
 *       401:
 *         description: Unauthorized
 * 
 * /ai-packages/purchase:
 *   post:
 *     summary: Purchase AI package and get PayOS payment link
 *     tags: [AI Packages]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PurchaseInput'
 *     responses:
 *       201:
 *         description: Payment link created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 transaction:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     paymentId:
 *                       type: string
 *                     orderCode:
 *                       type: number
 *                     checkoutUrl:
 *                       type: string
 *                       example: https://payos-checkout-url...
 *                     amount:
 *                       type: number
 *                     packageName:
 *                       type: string
 *       404:
 *         description: Package or user not found
 *       400:
 *         description: Package not available
 *       401:
 *         description: Unauthorized
 * 
 * /ai-packages/payment-status/{orderCode}:
 *   get:
 *     summary: Reconcile and get an AI package payment status
 *     description: Uses the local status first and asks payOS when the payment is still pending.
 *     tags: [AI Packages]
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
 *         description: AI package payment not found
 *
 * /ai-packages/transaction/{transactionId}:
 *   get:
 *     summary: Get transaction details
 *     tags: [AI Packages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: transactionId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Transaction details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 transaction:
 *                   $ref: '#/components/schemas/AITransaction'
 *       404:
 *         description: Transaction not found
 *       403:
 *         description: Permission denied
 * 
 * /ai-packages/use-credits:
 *   post:
 *     summary: Use AI credits
 *     tags: [AI Packages]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UseCreditsInput'
 *     responses:
 *       200:
 *         description: Credits used successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 creditsUsed:
 *                   type: number
 *                 remainingBalance:
 *                   type: number
 *                 monthlyAiCredits:
 *                   type: number
 *                 paidAiCredits:
 *                   type: number
 *       400:
 *         description: Insufficient credits or invalid amount
 *       401:
 *         description: Unauthorized
 * 
 * /ai-packages/transactions:
 *   get:
 *     summary: Get all transactions - Admin/Manager only
 *     tags: [AI Packages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Filter by status
 *       - in: query
 *         name: provider
 *         schema:
 *           type: string
 *         description: Filter by provider
 *     responses:
 *       200:
 *         description: List of all transactions
 *       403:
 *         description: Forbidden - Admin/Manager only
 * 
 * /ai-packages/add-credits:
 *   post:
 *     summary: Add credits to user - Admin/Manager only
 *     tags: [AI Packages]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AddCreditsInput'
 *     responses:
 *       200:
 *         description: Credits added successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 userId:
 *                   type: string
 *                 newBalance:
 *                   type: number
 *                 monthlyAiCredits:
 *                   type: number
 *                 paidAiCredits:
 *                   type: number
 *       400:
 *         description: Invalid userId or credits
 *       404:
 *         description: User not found
 *       403:
 *         description: Forbidden - Admin/Manager only
 * 
 * /ai-packages/webhook/payos:
 *   post:
 *     summary: Deprecated alias for the unified PayOS webhook
 *     deprecated: true
 *     description: Configure payOS to use /payos/webhook instead.
 *     tags: [AI Packages]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               success:
 *                 type: boolean
 *                 example: true
 *               code:
 *                 type: string
 *                 example: "00"
 *               data:
 *                 type: object
 *                 properties:
 *                   orderCode:
 *                     type: number
 *                     example: 1717406400
 *                   amount:
 *                     type: number
 *                     example: 50000
 *                   code:
 *                     type: string
 *                     example: "00"
 *                   paymentLinkId:
 *                     type: string
 *                     example: "pl_swagger_123"
 *                   reference:
 *                     type: string
 *                     example: "BANK_REF_123"
 *                   transactionDateTime:
 *                     type: string
 *                     format: date-time
 *                     example: "2026-06-03T15:00:00.000Z"
 *     responses:
 *       200:
 *         description: Webhook processed successfully
 *       400:
 *         description: Invalid webhook or amount mismatch
 */

const express = require("express");
const {
  getAvailablePackages,
  getAllPackages,
  createPackage,
  updatePackage,
  deletePackage,
  getMyTransactions,
  getMyCreditsBalance,
  purchasePackage,
  getTransactionDetails,
  getPackagePaymentStatus,
  getAllTransactions,
  addCreditsToUser,
  useAiCredits,
} = require("../controllers/aiPackageController");
const { handlePayOSWebhook } = require("../controllers/payosController");
const authMiddleware = require("../middleware/authMiddleware");
const { requireRoles } = require("../middleware/roleMiddleware");

const router = express.Router();

// Public routes - Available packages
router.get("/packages", getAvailablePackages);

// User routes - Authenticated
router.get("/my/transactions", authMiddleware, getMyTransactions);
router.get("/my/balance", authMiddleware, getMyCreditsBalance);
router.post("/purchase", authMiddleware, purchasePackage);
router.get("/payment-status/:orderCode", authMiddleware, getPackagePaymentStatus);
router.get("/transaction/:transactionId", authMiddleware, getTransactionDetails);
router.post("/use-credits", authMiddleware, useAiCredits);

// Admin/Manager routes - Package management
router.get("/packages/all", authMiddleware, requireRoles("admin", "manager"), getAllPackages);
router.post("/packages", authMiddleware, requireRoles("admin", "manager"), createPackage);
router.put("/packages/:id", authMiddleware, requireRoles("admin", "manager"), updatePackage);
router.delete("/packages/:id", authMiddleware, requireRoles("admin", "manager"), deletePackage);

// Admin routes - Transaction management
router.get("/transactions", authMiddleware, requireRoles("admin", "manager"), getAllTransactions);
router.post("/add-credits", authMiddleware, requireRoles("admin", "manager"), addCreditsToUser);

// Backward-compatible alias. Configure payOS with the canonical /api/payos/webhook URL.
router.post("/webhook/payos", handlePayOSWebhook);

module.exports = router;
