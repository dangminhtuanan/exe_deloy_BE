const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const multerMiddleware = require("../middleware/multerMiddleware");
const { updateProfile, getProfile, requestChangeEmailOtp, verifyCurrentEmailOtp, requestNewEmailOtp, changeEmail, requestChangePasswordOtp, changePassword, uploadAvatar: uploadAvatarController, getAvatar } = require("../controllers/profileController");

/**
 * @swagger
 * tags:
 *   name: Profile
 *   description: API thông tin cá nhân người dùng (JWT)
 */

/**
 * @swagger
 * /profile/change-password/request-otp:
 *   post:
 *     summary: Gửi OTP đổi mật khẩu về email
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Nếu email tồn tại, OTP đã được gửi
 *       401:
 *         description: Không xác thực
 *       404:
 *         description: Không tìm thấy người dùng
 *       500:
 *         description: Lỗi server
 */
router.post("/profile/change-password/request-otp", authMiddleware, requestChangePasswordOtp);

/**
 * @swagger
 * /profile/change-password/verify-otp:
 *   post:
 *     summary: Xác thực OTP và đổi mật khẩu
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               otp:
 *                 type: string
 *               newPassword:
 *                 type: string
 *               confirmPassword:
 *                 type: string
 *     responses:
 *       200:
 *         description: Đổi mật khẩu thành công
 *       400:
 *         description: Mã OTP hoặc mật khẩu không hợp lệ
 *       401:
 *         description: Không xác thực
 *       404:
 *         description: Không tìm thấy người dùng
 *       500:
 *         description: Lỗi server
 */
router.post("/profile/change-password/verify-otp", authMiddleware, changePassword);

/**
 * @swagger
 * /profile/get-profile:
 *   get:
 *     summary: Lấy thông tin cá nhân
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lấy thông tin thành công
 *       401:
 *         description: Không xác thực
 *       404:
 *         description: Không tìm thấy người dùng
 *       500:
 *         description: Lỗi server
 */
router.get("/profile/get-profile", authMiddleware, getProfile);

/**
 * @swagger
 * /profile/update:
 *   put:
 *     summary: Cập nhật thông tin cá nhân
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *               phone:
 *                 type: string
 *               address:
 *                 type: string
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       401:
 *         description: Không xác thực
 *       500:
 *         description: Lỗi server
 */
router.put("/profile/update", authMiddleware, updateProfile);

/**
 * @swagger
 * /profile/change-email/request-old-otp:
 *   post:
 *     summary: Gửi OTP xác thực đổi email hiện tại (Bước 1)
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Nếu email tồn tại, OTP đã được gửi
 *       401:
 *         description: Không xác thực
 *       404:
 *         description: Không tìm thấy người dùng
 *       500:
 *         description: Lỗi server
 */
router.post("/profile/change-email/request-old-otp", authMiddleware, requestChangeEmailOtp);

/**
 * @swagger
 * /profile/change-email/verify-old-otp:
 *   post:
 *     summary: Xác thực OTP email hiện tại (bước 2)
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               otp:
 *                 type: string
 *                 description: Mã OTP vừa nhận ở email hiện tại
 *     responses:
 *       200:
 *         description: Xác thực OTP thành công
 *       400:
 *         description: Mã OTP không hợp lệ
 *       401:
 *         description: Không xác thực
 *       404:
 *         description: Không tìm thấy người dùng
 *       500:
 *         description: Lỗi server
 */
router.post("/profile/change-email/verify-old-otp", authMiddleware, verifyCurrentEmailOtp);

/**
 * @swagger
 * /profile/change-email/request-new-otp:
 *   post:
 *     summary: Gửi OTP xác thực email mới (bước 3)
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               newEmail:
 *                 type: string
 *                 description: Email mới muốn đổi
 *     responses:
 *       200:
 *         description: Nếu email hợp lệ, OTP đã được gửi tới email mới
 *       400:
 *         description: Email không hợp lệ hoặc chưa xác thực OTP email cũ
 *       401:
 *         description: Không xác thực
 *       404:
 *         description: Không tìm thấy người dùng
 *       500:
 *         description: Lỗi server
 */
router.post("/profile/change-email/request-new-otp", authMiddleware, requestNewEmailOtp);

/**
 * @swagger
 * /profile/change-email/verify-new-otp:
 *   post:
 *     summary: Xác thực OTP email mới (bước 4)
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               otp:
 *                 type: string
 *                 description: Mã OTP vừa nhận ở email mới
 *     responses:
 *       200:
 *         description: Đổi email thành công
 *       400:
 *         description: Mã OTP không hợp lệ hoặc chưa thực hiện đúng các bước
 *       401:
 *         description: Không xác thực
 *       404:
 *         description: Không tìm thấy người dùng
 *       500:
 *         description: Lỗi server
 */
router.post("/profile/change-email/verify-new-otp", authMiddleware, changeEmail);

/**
 * @swagger
 * /profile/upload-avatar:
 *   post:
 *     summary: Tải lên ảnh đại diện
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               avatar:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Tải lên ảnh đại diện thành công
 *       401:
 *         description: Không xác thực
 *       500:
 *         description: Lỗi server
 */
router.post("/profile/upload-avatar", authMiddleware, multerMiddleware.single("avatar"), uploadAvatarController);

/**
 * @swagger
 * /profile/avatar:
 *   get:
 *     summary: Lấy thông tin avatar hiện tại
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lấy thông tin avatar thành công
 *       401:
 *         description: Không xác thực
 *       404:
 *         description: Không tìm thấy người dùng
 *       500:
 *         description: Lỗi server
 */
router.get("/profile/avatar", authMiddleware, getAvatar);

module.exports = router;
