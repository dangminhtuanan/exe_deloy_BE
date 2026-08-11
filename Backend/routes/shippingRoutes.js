const express = require("express");
const router = express.Router();
const shippingController = require("../controllers/shippingController");
const authMiddleware = require("../middleware/authMiddleware");
const { requireRoles } = require("../middleware/roleMiddleware");

// Middleware combinations
const adminOnly = [authMiddleware, requireRoles("admin")];
const staffOnly = [authMiddleware, requireRoles("admin", "staff")];
const shipperOnly = [authMiddleware, requireRoles("shipper")];
const shipperOrAdminOnly = [authMiddleware, requireRoles("shipper", "admin")];
const adminOrShipperOnly = [authMiddleware, requireRoles("admin", "shipper")];

/**
 * @swagger
 * tags:
 *   name: Shipping
 *   description: API quản lý vận chuyển và tracking đơn hàng
 */

/**
 * @swagger
 * /shipping:
 *   get:
 *     summary: Lấy tất cả bản ghi vận chuyển (Admin/Manager)
 *     tags: [Shipping]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách tất cả vận chuyển
 *       401:
 *         description: Không có quyền truy cập
 */
router.get("/", adminOnly, shippingController.getAllShippings);

/**
 * @swagger
 * /shipping:
 *   post:
 *     summary: Tạo bản ghi vận chuyển mới
 *     tags: [Shipping]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - orderId
 *             properties:
 *               orderId:
 *                 type: string
 *                 example: "607f1f77bcf86cd799439011"
 *               shippingMethod:
 *                 type: string
 *                 enum: [standard, express, overnight]
 *                 default: standard
 *               weight:
 *                 type: number
 *                 example: 2.5
 *               shippingCost:
 *                 type: number
 *                 example: 25000
 *     responses:
 *       201:
 *         description: Bản ghi vận chuyển đã được tạo
 *       400:
 *         description: Đơn hàng không tồn tại hoặc đã có bản ghi vận chuyển
 */
router.post("/", staffOnly, shippingController.createShipping);

/**
 * @swagger
 * /shipping/order/{orderId}:
 *   get:
 *     summary: Lấy thông tin vận chuyển theo orderId
 *     tags: [Shipping]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: orderId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Thông tin vận chuyển
 *       404:
 *         description: Vận chuyển không tìm thấy
 */
router.get("/order/:orderId", authMiddleware, shippingController.getShippingByOrderId);

/**
 * @swagger
 * /shipping/my/shipments:
 *   get:
 *     summary: Shipper xem danh sách vận chuyển của mình
 *     tags: [Shipping]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: status
 *         in: query
 *         schema:
 *           type: string
 *           enum: [pending, picked_up, in_transit, out_for_delivery, delivered, failed, returned]
 *     responses:
 *       200:
 *         description: Danh sách vận chuyển của shipper
 *       403:
 *         description: Chỉ shipper mới có quyền truy cập
 */
router.get("/my/shipments", shipperOnly, shippingController.getMyShipments);

/**
 * @swagger
 * /shipping/{shippingId}/history:
 *   get:
 *     summary: Lấy lịch sử theo dõi (Tracking)
 *     tags: [Shipping]
 *     parameters:
 *       - name: shippingId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Lịch sử cập nhật vận chuyển
 *       404:
 *         description: Vận chuyển không tìm thấy
 */
router.get("/:shippingId/history", authMiddleware, shippingController.getShippingHistory);

/**
 * @swagger
 * /shipping/shipper/{shipperId}:
 *   get:
 *     summary: Lấy danh sách vận chuyển của một shipper
 *     tags: [Shipping]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: shipperId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *       - name: status
 *         in: query
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Danh sách vận chuyển
 */
router.get("/shipper/:shipperId", adminOrShipperOnly, shippingController.getShipperShipments);

/**
 * @swagger
 * /shipping/shipper/{shipperId}/statistics:
 *   get:
 *     summary: Lấy thống kê hiệu suất shipper
 *     tags: [Shipping]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: shipperId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Thống kê giao hàng, đơn hàng failed, etc
 */
router.get("/shipper/:shipperId/statistics", adminOrShipperOnly, shippingController.getShipperStatistics);

/**
 * @swagger
 * /shipping/{shippingId}/assign-shipper:
 *   post:
 *     summary: Gán shipper cho bản ghi vận chuyển
 *     tags: [Shipping]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: shippingId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - shipperId
 *             properties:
 *               shipperId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Shipper đã được gán thành công
 *       404:
 *         description: Shipper hoặc vận chuyển không tìm thấy
 */
router.post("/:shippingId/assign-shipper", adminOnly, shippingController.assignShipper);

/**
 * @swagger
 * /shipping/{shippingId}/status:
 *   put:
 *     summary: Cập nhật trạng thái vận chuyển
 *     tags: [Shipping]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: shippingId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [pending, picked_up, in_transit, out_for_delivery, delivered, failed, returned]
 *               location:
 *                 type: string
 *                 example: "Hà Nội"
 *               notes:
 *                 type: string
 *                 example: "Đã lấy hàng từ kho"
 *     responses:
 *       200:
 *         description: Trạng thái đã cập nhật, Order status cũng tự động cập nhật
 *       400:
 *         description: Trạng thái không hợp lệ
 */
router.put("/:shippingId/status", shipperOrAdminOnly, shippingController.updateShippingStatus);

/**
 * @swagger
 * /shipping/{shippingId}:
 *   put:
 *     summary: Cập nhật chi tiết vận chuyển (địa chỉ, chi phí, etc)
 *     tags: [Shipping]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: shippingId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               shippingAddress:
 *                 type: object
 *                 properties:
 *                   street:
 *                     type: string
 *                   city:
 *                     type: string
 *                   zipCode:
 *                     type: string
 *               shippingCost:
 *                 type: number
 *               weight:
 *                 type: number
 *               estimatedDelivery:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       200:
 *         description: Chi tiết vận chuyển đã được cập nhật
 */
router.put("/:shippingId", staffOnly, shippingController.updateShippingDetails);

/**
 * @swagger
 * /shipping/{shippingId}/cancel:
 *   put:
 *     summary: Hủy vận chuyển (chỉ hủy được khi chưa giao)
 *     tags: [Shipping]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: shippingId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *                 example: "Khách hàng yêu cầu hủy"
 *     responses:
 *       200:
 *         description: Vận chuyển đã hủy, Order status quay lại "packing"
 *       400:
 *         description: Không thể hủy vận chuyển này
 */
router.put("/:shippingId/cancel", adminOrShipperOnly, shippingController.cancelShipping);

module.exports = router;
