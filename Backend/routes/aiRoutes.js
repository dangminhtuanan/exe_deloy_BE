const express = require("express");
const {
  createBehaviorLog,
  createChatbotLog,
  createMixMatch,
  createMixMatchTryOn,
  createTryOn,
  chatWithGemini,
  getBehaviorLogs,
  getChatbotLogs,
  getMyTryOns,
  getRecommendations,
} = require("../controllers/aiController");
const authMiddleware = require("../middleware/authMiddleware");
const optionalAuthMiddleware = require("../middleware/optionalAuthMiddleware");
const { requireRoles } = require("../middleware/roleMiddleware");

const router = express.Router();
const staffOnly = [authMiddleware, requireRoles("admin", "staff")];

router.get("/recommendations", optionalAuthMiddleware, getRecommendations);
router.post("/chat", optionalAuthMiddleware, chatWithGemini);
router.post("/mix-match", optionalAuthMiddleware, createMixMatch);
router.post("/mix-match/try-on", optionalAuthMiddleware, createMixMatchTryOn);
router.post("/try-on", optionalAuthMiddleware, createTryOn);
router.get("/try-ons/my", authMiddleware, getMyTryOns);
router.post("/behavior-logs", optionalAuthMiddleware, createBehaviorLog);
router.post("/chatbot-logs", optionalAuthMiddleware, createChatbotLog);
router.get("/behavior-logs", staffOnly, getBehaviorLogs);
router.get("/chatbot-logs", staffOnly, getChatbotLogs);

module.exports = router;
