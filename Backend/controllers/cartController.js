const CartItem = require("../models/CartItem");
const Product = require("../models/Product");
const { parsePagination, buildPagination } = require("../utils/pagination");

const MAX_CART_ITEMS = Number(process.env.CART_MAX_ITEMS) || 100; // max distinct products per cart
const CART_PAGINATION_TRIGGER = 50; // if user has more than this, force pagination

async function getUserCartItems(userId, { skip, limit } = {}) {
  const query = CartItem.find({ user: userId }).populate({
    path: "product",
    populate: { path: "category", select: "name slug" },
  }).sort({ updatedAt: -1 });

  if (typeof skip !== "undefined" && typeof limit !== "undefined") {
    query.skip(skip).limit(limit);
  }

  return query;
}

async function buildCartResponse(req, userId) {
  const total = await CartItem.countDocuments({ user: userId });
  const shouldPaginate = typeof req.query.page !== "undefined" || typeof req.query.limit !== "undefined" || total > CART_PAGINATION_TRIGGER;

  if (shouldPaginate) {
    const pagination = parsePagination(req, { defaultLimit: 20, maxLimit: 200 });
    const items = await getUserCartItems(userId, { skip: pagination.skip, limit: pagination.limit });
    return {
      cart: buildCartSummary(items),
      pagination: buildPagination(total, pagination.page, pagination.limit),
    };
  }

  const items = await getUserCartItems(userId);
  return { cart: buildCartSummary(items) };
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
    const result = await buildCartResponse(req, req.user.id);
    res.json({ message: "Get cart successfully", ...result });
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
      const uniqueCount = await CartItem.countDocuments({ user: req.user.id });
      if (uniqueCount >= MAX_CART_ITEMS) {
        return res.status(400).json({ message: `Cart item limit reached (${MAX_CART_ITEMS})` });
      }

      await CartItem.create({
        user: req.user.id,
        product: product._id,
        size,
        color,
        quantity: nextQuantity,
      });
    }

    const result = await buildCartResponse(req, req.user.id);
    res.status(201).json({ message: "Add cart item successfully", ...result });
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

    const result = await buildCartResponse(req, req.user.id);
    res.json({ message: "Update cart item successfully", ...result });
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
    const result = await buildCartResponse(req, req.user.id);
    res.json({ message: "Remove cart item successfully", ...result });
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
