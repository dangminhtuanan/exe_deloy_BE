const express = require("express");
const { getAllUsers, getUserById, createUser, updateUser, deleteUser } = require("../controllers/userController");
const authMiddleware = require("../middleware/authMiddleware");
const router = express.Router();

// Middleware kiểm tra quyền admin
function managerOrAdmin(req, res, next) {
  if (req.user && ["admin", "manager"].includes(req.user.role)) return next();
  return res.status(403).json({ message: "Permission denied" });
}

function adminOnly(req, res, next) {
  if (req.user && req.user.role === "admin") return next();
  return res.status(403).json({ message: "Chỉ admin mới được phép!" });
}

router.use(authMiddleware);

/**
 * @swagger
 * tags:
 *   name: User
 *   description: Quản lý user (chỉ admin)
 */

/**
 * @swagger
 * /users:
 *   get:
 *     summary: Lấy danh sách user
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách user
 */
router.get("/", managerOrAdmin, getAllUsers);

/**
 * @swagger
 * /users/{id}:
 *   get:
 *     summary: Xem chi tiết user
 *     tags: [User]
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
 *         description: Thông tin user
 */
router.get("/:id", managerOrAdmin, getUserById);

/**
 * @swagger
 * /users:
 *   post:
 *     summary: Tạo user mới
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - email
 *               - password
 *               - role
 *             properties:
 *               username:
 *                 type: string
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *               role:
 *                 type: string
 *                 enum: [user, customer, staff, manager, admin, shipper]
 *     responses:
 *       201:
 *         description: User đã được tạo
 */
router.post("/", adminOnly, createUser);

/**
 * @swagger
 * /users/{id}:
 *   put:
 *     summary: Sửa thông tin user
 *     tags: [User]
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
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *               email:
 *                 type: string
 *               role:
 *                 type: string
 *                 enum: [user, customer, staff, manager, admin, shipper]
 *     responses:
 *       200:
 *         description: User đã được cập nhật
 */
router.put("/:id", adminOnly, updateUser);

/**
 * @swagger
 * /users/{id}:
 *   delete:
 *     summary: Xóa user
 *     tags: [User]
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
 *         description: User đã bị xóa
 */
router.delete("/:id", adminOnly, deleteUser);

module.exports = router;
