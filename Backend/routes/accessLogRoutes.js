const express = require("express");
const AccessLog = require("../models/AccessLog");
const authMiddleware = require("../middleware/authMiddleware");
const { parsePagination, buildPagination } = require("../utils/pagination");

const router = express.Router();

router.get("/login-history", authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.id;
    const isAdmin = req.user?.role === "admin";
    const query = isAdmin ? { type: "login" } : { userId, type: "login" };
    const pagination = parsePagination(req, { defaultLimit: 25, maxLimit: 200 });

    const [logs, total] = await Promise.all([
      AccessLog.find(query)
        .sort({ createdAt: -1 })
        .select("userId type ip userAgent createdAt")
        .skip(pagination.skip)
        .limit(pagination.limit),
      AccessLog.countDocuments(query),
    ]);

    res.json({
      logs,
      pagination: buildPagination(total, pagination.page, pagination.limit),
    });
  } catch (error) {
    console.error("Lỗi khi lấy lịch sử login:", error);
    res.status(500).json({ message: "Đã xảy ra lỗi khi lấy lịch sử login" });
  }
});

module.exports = router;
