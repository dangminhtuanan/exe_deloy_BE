const express = require("express");
const {
  createReview,
  deleteReview,
  getProductReviews,
  updateReview,
} = require("../controllers/reviewController");
const authMiddleware = require("../middleware/authMiddleware");
const { requireRoles } = require("../middleware/roleMiddleware");

const router = express.Router();
const userOnly = [authMiddleware, requireRoles("user")];

router.get("/product/:productId", getProductReviews);
router.post("/", userOnly, createReview);
router.put("/:id", userOnly, updateReview);
router.delete("/:id", userOnly, deleteReview);

module.exports = router;
