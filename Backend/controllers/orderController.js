const CartItem = require("../models/CartItem");
const Order = require("../models/Order");
const Payment = require("../models/Payment");
const Product = require("../models/Product");
const User = require("../models/User");
const { getPayOSClient } = require("../config/payos");
const { isStaffRole } = require("../middleware/roleMiddleware");

function canAccessOrder(req, order) {
  return isStaffRole(req.user?.role) || String(order.user._id || order.user) === String(req.user.id);
}

async function buildItemsFromRequest(userId, bodyItems) {
  const sourceItems = [];

  if (Array.isArray(bodyItems) && bodyItems.length > 0) {
    for (const item of bodyItems) {
      const productId = item.productId || item.product;
      const quantity = Math.max(Number(item.quantity) || 1, 1);
      const product = await Product.findOne({ _id: productId, isActive: true });

      if (!product) {
        throw new Error("Product not found");
      }

      sourceItems.push({
        product,
        quantity,
        size: item.size || "",
        color: item.color || "",
      });
    }

    return { sourceItems, shouldClearCart: false };
  }

  const cartItems = await CartItem.find({ user: userId }).populate("product");
  for (const cartItem of cartItems) {
    if (!cartItem.product || cartItem.product.isActive === false) {
      continue;
    }

    sourceItems.push({
      product: cartItem.product,
      quantity: cartItem.quantity,
      size: cartItem.size || "",
      color: cartItem.color || "",
    });
  }

  return { sourceItems, shouldClearCart: true };
}

async function restoreOrderStock(order) {
  for (const item of order.items) {
    const product = await Product.findById(item.product);
    if (product) {
      await product.updateStock(item.quantity, "increase");
    }
  }
}

function calculateCheckoutTotals(orderItems) {
  const subtotal = orderItems.reduce((total, item) => total + item.subtotal, 0);
  const tax = Math.round(subtotal * 0.1);
  const shippingFee = subtotal > 500000 ? 0 : 30000;

  return {
    subtotal,
    tax,
    shippingFee,
    totalAmount: subtotal + tax + shippingFee,
  };
}

function moveOrderAfterPaid(order) {
  if (["PENDING_PAYMENT", "pending", "PAID"].includes(order.status)) {
    order.status = "confirmed";
  }
}

function generatePayOSOrderCode() {
  return Number(`${Date.now()}${Math.floor(Math.random() * 90 + 10)}`);
}

async function buildItemsFromServerCart(userId) {
  const cartItems = await CartItem.find({ user: userId }).populate("product");
  const sourceItems = [];

  for (const cartItem of cartItems) {
    if (!cartItem.product || cartItem.product.isActive === false) {
      continue;
    }

    sourceItems.push({
      cartItem,
      product: cartItem.product,
      quantity: Math.max(Number(cartItem.quantity) || 1, 1),
      size: cartItem.size || "",
      color: cartItem.color || "",
    });
  }

  return sourceItems;
}

exports.createOrder = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const { sourceItems, shouldClearCart } = await buildItemsFromRequest(req.user.id, req.body.items);

    if (sourceItems.length === 0) {
      return res.status(400).json({ message: "Order items are required" });
    }

    const orderItems = [];
    for (const item of sourceItems) {
      if (item.product.stock < item.quantity) {
        return res.status(400).json({ message: `${item.product.name} stock is not enough` });
      }

      orderItems.push({
        product: item.product._id,
        name: item.product.name,
        image: item.product.images?.[0] || "",
        size: item.size,
        color: item.color,
        price: item.product.price,
        quantity: item.quantity,
        subtotal: item.product.price * item.quantity,
      });
    }

    const customerName = req.body.customerName || user.username;
    const phone = req.body.phone || user.phone;
    const address = req.body.address || user.address;

    if (!customerName || !phone || !address) {
      return res.status(400).json({ message: "Customer name, phone and address are required" });
    }

    const totals = calculateCheckoutTotals(orderItems);
    const order = await Order.create({
      user: req.user.id,
      items: orderItems,
      customerName,
      phone,
      address,
      note: req.body.note || "",
      subtotal: totals.subtotal,
      tax: totals.tax,
      shippingFee: totals.shippingFee,
      totalAmount: totals.totalAmount,
      paymentStatus: "pending",
    });

    for (const item of sourceItems) {
      await item.product.updateStock(item.quantity, "decrease");
    }

    const paymentProvider = req.body.paymentProvider || "cod";
    const payment = await Payment.create({
      order: order._id,
      user: req.user.id,
      provider: paymentProvider,
      amount: totals.totalAmount,
      status: "pending",
    });

    order.payment = payment._id;
    await order.save();

    if (shouldClearCart) {
      await CartItem.deleteMany({ user: req.user.id });
    }

    await order.populate([
      { path: "user", select: "username email phone address role" },
      { path: "items.product", select: "name slug images price" },
      { path: "payment" },
    ]);

    res.status(201).json({ message: "Create order successfully", order });
  } catch (error) {
    res.status(500).json({ message: "Cannot create order", error: error.message });
  }
};

exports.createPayOSCheckout = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const customerName = String(req.body.customerName || user.username || "").trim();
    const phone = String(req.body.phone || user.phone || "").trim();
    const email = String(req.body.email || user.email || "").trim().toLowerCase();
    const address = String(req.body.address || user.address || "").trim();
    const note = String(req.body.note || "").trim();

    if (!customerName || !phone || !email || !address) {
      return res.status(400).json({ message: "Customer name, phone, email and address are required" });
    }

    const sourceItems = await buildItemsFromServerCart(req.user.id);
    if (sourceItems.length === 0) {
      return res.status(400).json({ message: "Cart is empty" });
    }

    const orderItems = [];
    for (const item of sourceItems) {
      if (item.product.stock < item.quantity) {
        return res.status(400).json({ message: `${item.product.name} stock is not enough` });
      }

      orderItems.push({
        product: item.product._id,
        name: item.product.name,
        image: item.product.images?.[0] || "",
        size: item.size,
        color: item.color,
        price: item.product.price,
        quantity: item.quantity,
        subtotal: item.product.price * item.quantity,
      });
    }

    const totals = calculateCheckoutTotals(orderItems);
    const orderCode = generatePayOSOrderCode();
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    const payOS = getPayOSClient();

    const order = await Order.create({
      user: req.user.id,
      items: orderItems,
      customerName,
      phone,
      email,
      address,
      note,
      subtotal: totals.subtotal,
      tax: totals.tax,
      shippingFee: totals.shippingFee,
      totalAmount: totals.totalAmount,
      status: "PENDING_PAYMENT",
      paymentStatus: "pending",
    });

    const payment = await Payment.create({
      order: order._id,
      user: req.user.id,
      provider: "PAYOS",
      orderCode,
      amount: totals.totalAmount,
      status: "PENDING",
    });

    order.payment = payment._id;
    await order.save();

    const paymentLink = await payOS.paymentRequests.create({
      orderCode,
      amount: totals.totalAmount,
      description: `OUTFIO${orderCode}`,
      items: orderItems.map((item) => ({
        name: item.name.slice(0, 100),
        quantity: item.quantity,
        price: item.price,
      })),
      buyerName: customerName,
      buyerEmail: email,
      buyerPhone: phone,
      buyerAddress: address,
      returnUrl: `${frontendUrl}/payment/return?orderCode=${orderCode}`,
      cancelUrl: `${frontendUrl}/payment/cancel?orderCode=${orderCode}`,
    });

    payment.paymentLinkId = paymentLink.paymentLinkId || "";
    payment.checkoutUrl = paymentLink.checkoutUrl;
    payment.rawResponse = paymentLink;
    await payment.save();

    for (const item of sourceItems) {
      await item.product.updateStock(item.quantity, "decrease");
    }
    await CartItem.deleteMany({ user: req.user.id });

    res.status(201).json({
      message: "Create payOS checkout successfully",
      checkoutUrl: paymentLink.checkoutUrl,
      orderCode,
      orderId: order._id,
    });
  } catch (error) {
    res.status(500).json({ message: "Cannot create payOS checkout", error: error.message });
  }
};

exports.getPaymentStatusByOrderCode = async (req, res) => {
  try {
    const orderCode = Number(req.params.orderCode);
    if (!Number.isSafeInteger(orderCode)) {
      return res.status(400).json({ message: "Order code is invalid" });
    }

    const payment = await Payment.findOne({ orderCode }).populate("order");
    if (!payment) {
      return res.status(404).json({ message: "Payment not found" });
    }

    if (payment.status === "PENDING" && process.env.PAYOS_CLIENT_ID) {
      try {
        const payOS = getPayOSClient();
        const paymentLink = await payOS.paymentRequests.get(orderCode);

        if (paymentLink.status === "PAID" && Number(paymentLink.amount) === Number(payment.amount)) {
          payment.status = "PAID";
          payment.paidAt = payment.paidAt || new Date();
          payment.rawResponse = paymentLink;
          await payment.save();

          if (payment.order) {
            moveOrderAfterPaid(payment.order);
            payment.order.paymentStatus = "paid";
            await payment.order.save();
          }
        } else if (["CANCELLED", "FAILED", "EXPIRED"].includes(paymentLink.status)) {
          payment.status = paymentLink.status === "CANCELLED" ? "CANCELLED" : "FAILED";
          payment.rawResponse = paymentLink;
          await payment.save();

          if (payment.order) {
            if (!["cancelled", "refunded", "completed"].includes(payment.order.status)) {
              await restoreOrderStock(payment.order);
            }
            payment.order.status = "cancelled";
            payment.order.paymentStatus = "failed";
            await payment.order.save();
          }
        }
      } catch {
        // Keep the locally verified status if payOS status lookup is unavailable.
      }
    }

    res.json({
      message: "Get payment status successfully",
      orderCode: payment.orderCode,
      paymentStatus: payment.status,
      orderStatus: payment.order?.status,
      amount: payment.amount,
      orderId: payment.order?._id,
    });
  } catch (error) {
    res.status(500).json({ message: "Cannot get payment status", error: error.message });
  }
};

exports.getMyOrders = async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user.id })
      .populate("items.product", "name slug images price")
      .populate("payment")
      .sort({ createdAt: -1 });

    res.json({ message: "Get my orders successfully", orders });
  } catch (error) {
    res.status(500).json({ message: "Cannot get orders", error: error.message });
  }
};

exports.getOrders = async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) {
      filter.status = req.query.status;
    }
    if (req.query.paymentStatus) {
      filter.paymentStatus = req.query.paymentStatus;
    }

    const orders = await Order.find(filter)
      .populate("user", "username email phone address role")
      .populate("items.product", "name slug images price")
      .populate("payment")
      .sort({ createdAt: -1 });

    res.json({ message: "Get orders successfully", orders });
  } catch (error) {
    res.status(500).json({ message: "Cannot get orders", error: error.message });
  }
};

exports.getOrderById = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate("user", "username email phone address role")
      .populate("items.product", "name slug images price")
      .populate("payment");

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (!canAccessOrder(req, order)) {
      return res.status(403).json({ message: "Permission denied" });
    }

    res.json({ message: "Get order successfully", order });
  } catch (error) {
    res.status(500).json({ message: "Cannot get order", error: error.message });
  }
};

exports.updateOrderStatus = async (req, res) => {
  try {
    const { status, paymentStatus } = req.body;
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    const previousStatus = order.status;
    if (status) {
      order.status = status;
    }

    if (paymentStatus) {
      order.paymentStatus = paymentStatus;
    }

    if (
      status === "cancelled" &&
      !["cancelled", "refunded"].includes(previousStatus)
    ) {
      await restoreOrderStock(order);
    }

    await order.save();
    await order.populate([
      { path: "user", select: "username email phone address role" },
      { path: "items.product", select: "name slug images price" },
      { path: "payment" },
    ]);

    res.json({ message: "Update order successfully", order });
  } catch (error) {
    res.status(500).json({ message: "Cannot update order", error: error.message });
  }
};

exports.cancelMyOrder = async (req, res) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, user: req.user.id });

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (!["pending", "confirmed"].includes(order.status)) {
      return res.status(400).json({ message: "Order cannot be cancelled" });
    }

    await restoreOrderStock(order);
    order.status = "cancelled";
    order.paymentStatus = order.paymentStatus === "paid" ? "refunded" : "unpaid";
    await order.save();

    res.json({ message: "Cancel order successfully", order });
  } catch (error) {
    res.status(500).json({ message: "Cannot cancel order", error: error.message });
  }
};
