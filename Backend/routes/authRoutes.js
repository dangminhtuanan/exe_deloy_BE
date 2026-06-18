const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const { register, login, requestReset, verifyOtp, sendRegisterOtp, verifyRegisterOtp, refreshTokenController } = require("../controllers/authController");

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: API xác thực người dùng (JWT)
 */

/**
 * @swagger
 * /auth/refresh-token:
 *   post:
 *     summary: Cấp mới access token bằng refresh token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refreshToken
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: Access token mới
 *       401:
 *         description: Thiếu refresh token
 *       403:
 *         description: Refresh token không hợp lệ hoặc đã hết hạn
 */
router.post("/refresh-token", refreshTokenController);

/**
 * @swagger
 * /auth/register-send-otp:
 *   post:
 *     summary: Gửi OTP đăng ký tài khoản
 *     tags: [Auth]
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
 *             properties:
 *               username:
 *                 type: string
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: OTP đăng ký đã được gửi đến email
 *       400:
 *         description: Lỗi gửi OTP
 */
router.post("/register-send-otp", sendRegisterOtp);

/**
 * @swagger
 * /auth/register-verify-otp:
 *   post:
 *     summary: Xác thực OTP đăng ký và hoàn tất đăng ký
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - otp
 *             properties:
 *               email:
 *                 type: string
 *               otp:
 *                 type: string
 *     responses:
 *       200:
 *         description: Xác thực OTP thành công, trả về token
 *       400:
 *         description: OTP không hợp lệ
 */

router.post("/register-verify-otp", verifyRegisterOtp);

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Đăng nhập và nhận JWT
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Đăng nhập thành công
 *       401:
 *         description: Sai thông tin đăng nhập
 */
router.post("/login", login);

/**
 * @swagger
 * /auth/request-reset:
 *   post:
 *     summary: Gửi OTP reset mật khẩu
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *     responses:
 *       200:
 *         description: Nếu email tồn tại, OTP đã được gửi
 */
router.post("/request-reset", requestReset);

/**
 * @swagger
 * /auth/verify-otp:
 *   post:
 *     summary: Xác thực OTP và đổi mật khẩu mới
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - otp
 *               - newPassword
 *               - confirmPassword
 *             properties:
 *               email:
 *                 type: string
 *               otp:
 *                 type: string
 *               newPassword:
 *                 type: string
 *               confirmPassword:
 *                 type: string
 *     responses:
 *       200:
 *         description: Đặt lại mật khẩu thành công
 *       400:
 *         description: OTP không hợp lệ hoặc mật khẩu không khớp
 */
router.post("/verify-otp", verifyOtp);

module.exports = router;
