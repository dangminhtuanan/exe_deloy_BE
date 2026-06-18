const express = require("express");
const {
  createProduct,
  deleteProduct,
  getProductById,
  getProducts,
  updateProduct,
} = require("../controllers/productController");
const authMiddleware = require("../middleware/authMiddleware");
const { requireRoles } = require("../middleware/roleMiddleware");

const router = express.Router();
const staffOnly = [authMiddleware, requireRoles("admin", "manager", "staff")];

router.get("/", getProducts);
router.get("/:id", getProductById);
router.post("/", staffOnly, createProduct);
router.put("/:id", staffOnly, updateProduct);
router.delete("/:id", staffOnly, deleteProduct);

module.exports = router;
