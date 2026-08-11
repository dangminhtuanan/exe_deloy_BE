const express = require("express");
const {
  createReview,
  adminDeleteReview,
  deleteReview,
  getAllReviews,
  getProductReviews,
  setReviewVisibility,
  updateReview,
} = require("../controllers/reviewController");
const authMiddleware = require("../middleware/authMiddleware");
const { requireRoles } = require("../middleware/roleMiddleware");

const router = express.Router();
const userOnly = [authMiddleware, requireRoles("user")];
const adminOnly = [authMiddleware, requireRoles("admin")];

router.get("/product/:productId", getProductReviews);
router.get("/admin", adminOnly, getAllReviews);
router.patch("/:id/visibility", adminOnly, setReviewVisibility);
router.delete("/:id/admin", adminOnly, adminDeleteReview);
router.post("/", userOnly, createReview);
router.put("/:id", userOnly, updateReview);
router.delete("/:id", userOnly, deleteReview);

module.exports = router;
