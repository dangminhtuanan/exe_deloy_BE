const CartItem = require("../models/CartItem");
const Order = require("../models/Order");
const Payment = require("../models/Payment");
const Product = require("../models/Product");
const User = require("../models/User");
const { getPayOSClient } = require("../config/payos");
const { isStaffRole } = require("../middleware/roleMiddleware");
const { parsePagination, buildPagination } = require("../utils/pagination");
const {
  PAYMENT_STATUS,
  PAYMENT_TARGET,
  findPaymentByOrderCode,
  generateUniquePayOSOrderCode,
  getPaymentTarget,
  markPaymentTerminated,
  normalizePaymentStatus,
  reconcilePayment,
} = require("../services/payosPaymentService");

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
      targetType: PAYMENT_TARGET.ORDER,
      order: order._id,
      user: req.user.id,
      provider: paymentProvider,
      amount: totals.totalAmount,
      status: PAYMENT_STATUS.PENDING,
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
    if (!Number.isSafeInteger(totals.totalAmount) || totals.totalAmount <= 0) {
      return res.status(400).json({ message: "Order total must be a positive VND integer" });
    }
    const orderCode = await generateUniquePayOSOrderCode();
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
      status: "pending",
      paymentStatus: "pending",
    });

    const payment = await Payment.create({
      targetType: PAYMENT_TARGET.ORDER,
      order: order._id,
      user: req.user.id,
      provider: "PAYOS",
      orderCode,
      amount: totals.totalAmount,
      status: "PENDING",
    });

    order.payment = payment._id;
    await order.save();

    let paymentLink;
    try {
      paymentLink = await payOS.paymentRequests.create({
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
        returnUrl: `${frontendUrl}/payment/return`,
        cancelUrl: `${frontendUrl}/payment/cancel`,
      });
    } catch (payosError) {
      // Stock has not been reserved yet, so only close the records created for this failed attempt.
      payment.status = PAYMENT_STATUS.FAILED;
      payment.stockRestoredAt = new Date();
      order.status = "cancelled";
      order.paymentStatus = "failed";
      await Promise.all([payment.save(), order.save()]);
      throw payosError;
    }

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
    let payment = await findPaymentByOrderCode(req.params.orderCode);
    if (!payment || getPaymentTarget(payment) !== PAYMENT_TARGET.ORDER) {
      return res.status(404).json({ message: "Order payment not found" });
    }

    if (String(payment.user) !== String(req.user.id) && !isStaffRole(req.user?.role)) {
      return res.status(403).json({ message: "Permission denied" });
    }

    let reconciliationWarning = null;
    if (normalizePaymentStatus(payment.status) === PAYMENT_STATUS.PENDING) {
      try {
        payment = await reconcilePayment(payment);
      } catch (error) {
        reconciliationWarning = error.message;
      }
    }

    await payment.populate("order");

    res.json({
      message: "Get payment status successfully",
      orderCode: payment.orderCode,
      paymentId: payment._id,
      paymentStatus: normalizePaymentStatus(payment.status),
      orderStatus: payment.order?.status,
      amount: payment.amount,
      orderId: payment.order?._id,
      paidAt: payment.paidAt,
      ...(reconciliationWarning ? { reconciliationWarning } : {}),
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: "Cannot get payment status", error: error.message });
  }
};

exports.getMyOrders = async (req, res) => {
  try {
    const pagination = parsePagination(req, { defaultLimit: 25, maxLimit: 100 });
    const filter = { user: req.user.id };

    const [orders, total] = await Promise.all([
      Order.find(filter)
        .populate("items.product", "name slug images price")
        .populate("payment")
        .sort({ createdAt: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit),
      Order.countDocuments(filter),
    ]);

    res.json({
      message: "Get my orders successfully",
      orders,
      pagination: buildPagination(total, pagination.page, pagination.limit),
    });
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

    const pagination = parsePagination(req, { defaultLimit: 25, maxLimit: 100 });
    const [orders, total] = await Promise.all([
      Order.find(filter)
        .populate("user", "username email phone address role")
        .populate("items.product", "name slug images price")
        .populate("payment")
        .sort({ createdAt: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit),
      Order.countDocuments(filter),
    ]);

    res.json({
      message: "Get orders successfully",
      orders,
      pagination: buildPagination(total, pagination.page, pagination.limit),
    });
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
    const allowedTransitions = {
      pending: ["confirmed", "cancelled"],
      confirmed: ["packing", "cancelled"],
      packing: ["shipping", "cancelled"],
      shipping: ["completed", "delivery_failed", "returned"],
      delivery_failed: ["shipping", "returned"],
      completed: ["refunded"],
      cancelled: [],
      refunded: [],
      returned: ["refunded"],
    };
    if (status) {
      if (status !== previousStatus && !allowedTransitions[previousStatus]?.includes(status)) {
        return res.status(400).json({ message: `Invalid order status transition: ${previousStatus} -> ${status}` });
      }
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
    let order = await Order.findOne({ _id: req.params.id, user: req.user.id });

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (!["pending", "confirmed"].includes(order.status)) {
      return res.status(400).json({ message: "Order cannot be cancelled" });
    }

    const payment = order.payment ? await Payment.findById(order.payment) : null;
    if (payment && normalizePaymentStatus(payment.status) === PAYMENT_STATUS.PAID) {
      return res.status(409).json({ message: "Paid orders require the staff refund workflow" });
    }

    if (payment) {
      let payOSResponse = null;
      if (payment.provider === "PAYOS" && payment.orderCode) {
        const payOS = getPayOSClient();
        payOSResponse = await payOS.paymentRequests.cancel(payment.orderCode, "Customer cancelled order");
      }

      await markPaymentTerminated(payment, PAYMENT_STATUS.CANCELLED, payOSResponse);
      order = await Order.findById(order._id);
      return res.json({ message: "Cancel order successfully", order });
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
