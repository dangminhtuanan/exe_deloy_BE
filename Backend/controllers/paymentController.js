const Order = require("../models/Order");
const Payment = require("../models/Payment");
const { isStaffRole } = require("../middleware/roleMiddleware");

function canAccessPayment(req, payment) {
  return isStaffRole(req.user?.role) || String(payment.user._id || payment.user) === String(req.user.id);
}

function mapPaymentStatusToOrder(status) {
  if (status === "paid") return "paid";
  if (status === "PAID") return "paid";
  if (status === "failed") return "failed";
  if (status === "FAILED" || status === "CANCELLED") return "failed";
  if (status === "refunded") return "refunded";
  return "pending";
}

function moveOrderAfterPaid(order) {
  if (["pending", "PENDING_PAYMENT", "PAID"].includes(order.status)) {
    order.status = "confirmed";
  }
}

exports.createPayment = async (req, res) => {
  try {
    const { orderId, provider = "cod", transactionNo = "", rawResponse = null } = req.body;
    const order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (!isStaffRole(req.user?.role) && String(order.user) !== String(req.user.id)) {
      return res.status(403).json({ message: "Permission denied" });
    }

    const payment = await Payment.create({
      order: order._id,
      user: order.user,
      provider,
      amount: order.totalAmount,
      status: "pending",
      transactionNo,
      rawResponse,
    });

    order.payment = payment._id;
    order.paymentStatus = "pending";
    await order.save();

    res.status(201).json({ message: "Create payment successfully", payment });
  } catch (error) {
    res.status(500).json({ message: "Cannot create payment", error: error.message });
  }
};

exports.getMyPayments = async (req, res) => {
  try {
    const payments = await Payment.find({ user: req.user.id })
      .populate("order")
      .sort({ createdAt: -1 });

    res.json({ message: "Get my payments successfully", payments });
  } catch (error) {
    res.status(500).json({ message: "Cannot get payments", error: error.message });
  }
};

exports.getPayments = async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.provider) filter.provider = req.query.provider;

    const payments = await Payment.find(filter)
      .populate("user", "username email phone")
      .populate("order")
      .sort({ createdAt: -1 });

    res.json({ message: "Get payments successfully", payments });
  } catch (error) {
    res.status(500).json({ message: "Cannot get payments", error: error.message });
  }
};

exports.getPaymentById = async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id)
      .populate("user", "username email phone")
      .populate("order");

    if (!payment) {
      return res.status(404).json({ message: "Payment not found" });
    }

    if (!canAccessPayment(req, payment)) {
      return res.status(403).json({ message: "Permission denied" });
    }

    res.json({ message: "Get payment successfully", payment });
  } catch (error) {
    res.status(500).json({ message: "Cannot get payment", error: error.message });
  }
};

exports.updatePaymentStatus = async (req, res) => {
  try {
    const { status, transactionNo, rawResponse } = req.body;
    const payment = await Payment.findById(req.params.id);

    if (!payment) {
      return res.status(404).json({ message: "Payment not found" });
    }

    if (status) {
      payment.status = status;
      payment.paidAt = status === "paid" ? new Date() : payment.paidAt;
    }

    if (transactionNo !== undefined) payment.transactionNo = transactionNo;
    if (rawResponse !== undefined) payment.rawResponse = rawResponse;

    await payment.save();

    const order = await Order.findById(payment.order);
    if (order) {
      order.paymentStatus = mapPaymentStatusToOrder(payment.status);
      if (order.paymentStatus === "paid") {
        moveOrderAfterPaid(order);
      }
      await order.save();
    }

    res.json({ message: "Update payment successfully", payment });
  } catch (error) {
    res.status(500).json({ message: "Cannot update payment", error: error.message });
  }
};
