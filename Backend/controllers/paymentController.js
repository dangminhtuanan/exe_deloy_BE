const Order = require("../models/Order");
const Payment = require("../models/Payment");
const { isStaffRole } = require("../middleware/roleMiddleware");
const { parsePagination, buildPagination } = require("../utils/pagination");
const {
  PAYMENT_STATUS,
  PAYMENT_TARGET,
  getPaymentTarget,
  markPaymentPaid,
  markPaymentTerminated,
  normalizePaymentStatus,
} = require("../services/payosPaymentService");

function canAccessPayment(req, payment) {
  return isStaffRole(req.user?.role) || String(payment.user._id || payment.user) === String(req.user.id);
}

function mapPaymentStatusToOrder(status) {
  const normalized = normalizePaymentStatus(status);
  if (normalized === PAYMENT_STATUS.PAID) return "paid";
  if ([PAYMENT_STATUS.FAILED, PAYMENT_STATUS.CANCELLED].includes(normalized)) return "failed";
  if (normalized === PAYMENT_STATUS.REFUNDED) return "refunded";
  return "pending";
}

function moveOrderAfterPaid(order) {
  if (["pending"].includes(order.status)) {
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
      targetType: PAYMENT_TARGET.ORDER,
      order: order._id,
      user: order.user,
      provider,
      amount: order.totalAmount,
      status: PAYMENT_STATUS.PENDING,
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
    const pagination = parsePagination(req, { defaultLimit: 25, maxLimit: 100 });
    const filter = { user: req.user.id };

    const [payments, total] = await Promise.all([
      Payment.find(filter)
        .populate("order")
        .populate("aiTransaction")
        .sort({ createdAt: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit),
      Payment.countDocuments(filter),
    ]);

    res.json({
      message: "Get my payments successfully",
      payments,
      pagination: buildPagination(total, pagination.page, pagination.limit),
    });
  } catch (error) {
    res.status(500).json({ message: "Cannot get payments", error: error.message });
  }
};

exports.getPayments = async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) {
      const status = normalizePaymentStatus(req.query.status);
      filter.status = { $in: [status, status.toLowerCase()] };
    }
    if (req.query.provider) filter.provider = req.query.provider;

    const pagination = parsePagination(req, { defaultLimit: 25, maxLimit: 100 });
    const [payments, total, paidSummary] = await Promise.all([
      Payment.find(filter)
        .populate("user", "username email phone")
        .populate("order")
        .populate("aiTransaction")
        .sort({ createdAt: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit),
      Payment.countDocuments(filter),
      Payment.aggregate([
        { $match: { status: { $in: [PAYMENT_STATUS.PAID, PAYMENT_STATUS.PAID.toLowerCase()] } } },
        {
          $group: {
            _id: null,
            paidCount: { $sum: 1 },
            paidRevenue: { $sum: "$amount" },
          },
        },
      ]),
    ]);

    const summary = paidSummary[0] || { paidCount: 0, paidRevenue: 0 };

    res.json({
      message: "Get payments successfully",
      payments,
      pagination: buildPagination(total, pagination.page, pagination.limit),
      summary: {
        paidCount: summary.paidCount,
        paidRevenue: summary.paidRevenue,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Cannot get payments", error: error.message });
  }
};

exports.getPaymentById = async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id)
      .populate("user", "username email phone")
      .populate("order")
      .populate("aiTransaction");

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
    let payment = await Payment.findById(req.params.id);

    if (!payment) {
      return res.status(404).json({ message: "Payment not found" });
    }

    if (status) {
      const normalizedStatus = normalizePaymentStatus(status);
      const currentStatus = normalizePaymentStatus(payment.status);
      if (!Object.values(PAYMENT_STATUS).includes(normalizedStatus)) {
        return res.status(400).json({ message: "Payment status is invalid" });
      }
      if (currentStatus === PAYMENT_STATUS.PAID && normalizedStatus === PAYMENT_STATUS.PENDING) {
        return res.status(409).json({ message: "A paid payment cannot return to pending" });
      }
      if (
        normalizedStatus === PAYMENT_STATUS.REFUNDED &&
        (currentStatus !== PAYMENT_STATUS.PAID || getPaymentTarget(payment) !== PAYMENT_TARGET.ORDER)
      ) {
        return res.status(409).json({ message: "Only a paid order payment can be marked as refunded" });
      }

      if (normalizedStatus === PAYMENT_STATUS.PAID) {
        payment = await markPaymentPaid(
          payment,
          {
            amount: payment.amount,
            reference: transactionNo || payment.transactionNo,
            transactionDateTime: new Date().toISOString(),
            paymentLinkId: payment.paymentLinkId,
          },
          rawResponse,
        );
      } else if ([PAYMENT_STATUS.CANCELLED, PAYMENT_STATUS.FAILED].includes(normalizedStatus)) {
        payment = await markPaymentTerminated(payment, normalizedStatus, rawResponse);
      } else {
        payment.status = normalizedStatus;
        await payment.save();
      }
    } else {
      payment.status = normalizePaymentStatus(payment.status);
    }

    if (transactionNo !== undefined) payment.transactionNo = transactionNo;
    if (rawResponse !== undefined) payment.rawResponse = rawResponse;
    await payment.save();

    if (getPaymentTarget(payment) === PAYMENT_TARGET.ORDER && payment.order) {
      const order = await Order.findById(payment.order);
      if (
        order &&
        ![PAYMENT_STATUS.PAID, PAYMENT_STATUS.CANCELLED, PAYMENT_STATUS.FAILED].includes(
          normalizePaymentStatus(payment.status),
        )
      ) {
        order.paymentStatus = mapPaymentStatusToOrder(payment.status);
        if (order.paymentStatus === "paid") moveOrderAfterPaid(order);
        await order.save();
      }
    }

    res.json({ message: "Update payment successfully", payment });
  } catch (error) {
    res.status(500).json({ message: "Cannot update payment", error: error.message });
  }
};
