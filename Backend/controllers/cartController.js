const CartItem = require("../models/CartItem");
const Product = require("../models/Product");

async function getUserCartItems(userId) {
  return CartItem.find({ user: userId })
    .populate({
      path: "product",
      populate: { path: "category", select: "name slug" },
    })
    .sort({ updatedAt: -1 });
}

function buildCartSummary(items) {
  const subtotal = items.reduce((total, item) => {
    if (!item.product) return total;
    return total + item.product.price * item.quantity;
  }, 0);

  return {
    items,
    subtotal,
    totalQuantity: items.reduce((total, item) => total + item.quantity, 0),
  };
}

exports.getCart = async (req, res) => {
  try {
    const items = await getUserCartItems(req.user.id);
    res.json({ message: "Get cart successfully", cart: buildCartSummary(items) });
  } catch (error) {
    res.status(500).json({ message: "Cannot get cart", error: error.message });
  }
};

exports.addCartItem = async (req, res) => {
  try {
    const { productId, quantity = 1, size = "", color = "" } = req.body;

    if (!productId) {
      return res.status(400).json({ message: "Product is required" });
    }

    const product = await Product.findOne({ _id: productId, isActive: true });
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    const nextQuantity = Math.max(Number(quantity) || 1, 1);
    if (product.stock < nextQuantity) {
      return res.status(400).json({ message: "Product stock is not enough" });
    }

    const existingItem = await CartItem.findOne({
      user: req.user.id,
      product: product._id,
      size,
      color,
    });

    if (existingItem) {
      const mergedQuantity = existingItem.quantity + nextQuantity;
      if (product.stock < mergedQuantity) {
        return res.status(400).json({ message: "Product stock is not enough" });
      }
      existingItem.quantity = mergedQuantity;
      await existingItem.save();
    } else {
      await CartItem.create({
        user: req.user.id,
        product: product._id,
        size,
        color,
        quantity: nextQuantity,
      });
    }

    const items = await getUserCartItems(req.user.id);
    res.status(201).json({ message: "Add cart item successfully", cart: buildCartSummary(items) });
  } catch (error) {
    res.status(500).json({ message: "Cannot add cart item", error: error.message });
  }
};

exports.updateCartItem = async (req, res) => {
  try {
    const { quantity } = req.body;
    const nextQuantity = Number(quantity);

    if (!Number.isFinite(nextQuantity)) {
      return res.status(400).json({ message: "Quantity is invalid" });
    }

    const item = await CartItem.findOne({ _id: req.params.id, user: req.user.id }).populate("product");
    if (!item) {
      return res.status(404).json({ message: "Cart item not found" });
    }

    if (nextQuantity <= 0) {
      await item.deleteOne();
    } else {
      if (!item.product || item.product.stock < nextQuantity) {
        return res.status(400).json({ message: "Product stock is not enough" });
      }

      item.quantity = nextQuantity;
      await item.save();
    }

    const items = await getUserCartItems(req.user.id);
    res.json({ message: "Update cart item successfully", cart: buildCartSummary(items) });
  } catch (error) {
    res.status(500).json({ message: "Cannot update cart item", error: error.message });
  }
};

exports.removeCartItem = async (req, res) => {
  try {
    const item = await CartItem.findOne({ _id: req.params.id, user: req.user.id });
    if (!item) {
      return res.status(404).json({ message: "Cart item not found" });
    }

    await item.deleteOne();
    const items = await getUserCartItems(req.user.id);
    res.json({ message: "Remove cart item successfully", cart: buildCartSummary(items) });
  } catch (error) {
    res.status(500).json({ message: "Cannot remove cart item", error: error.message });
  }
};

exports.clearCart = async (req, res) => {
  try {
    await CartItem.deleteMany({ user: req.user.id });
    res.json({ message: "Clear cart successfully", cart: buildCartSummary([]) });
  } catch (error) {
    res.status(500).json({ message: "Cannot clear cart", error: error.message });
  }
};
