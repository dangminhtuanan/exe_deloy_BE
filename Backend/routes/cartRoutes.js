const express = require("express");
const {
  addCartItem,
  clearCart,
  getCart,
  removeCartItem,
  updateCartItem,
} = require("../controllers/cartController");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

router.use(authMiddleware);

router.get("/", getCart);
router.post("/items", addCartItem);
router.put("/items/:id", updateCartItem);
router.delete("/items/:id", removeCartItem);
router.delete("/", clearCart);

module.exports = router;
