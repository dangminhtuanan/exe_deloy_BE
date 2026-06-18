const express = require("express");
const {
  createCategory,
  deleteCategory,
  getCategories,
  getCategoryById,
  updateCategory,
} = require("../controllers/categoryController");
const authMiddleware = require("../middleware/authMiddleware");
const { requireRoles } = require("../middleware/roleMiddleware");

const router = express.Router();
const staffOnly = [authMiddleware, requireRoles("admin", "manager", "staff")];

router.get("/", getCategories);
router.get("/:id", getCategoryById);
router.post("/", staffOnly, createCategory);
router.put("/:id", staffOnly, updateCategory);
router.delete("/:id", staffOnly, deleteCategory);

module.exports = router;
