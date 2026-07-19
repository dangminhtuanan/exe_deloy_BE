const { randomInt } = require("crypto");
const mongoose = require("mongoose");
const AITransaction = require("../models/AITransaction");
const Order = require("../models/Order");
const Payment = require("../models/Payment");
const Product = require("../models/Product");
const User = require("../models/User");
const { getPayOSClient } = require("../config/payos");
const { addPaidAiCredits } = require("./monthlyAiCreditService");

const PAYMENT_STATUS = Object.freeze({
  PENDING: "PENDING",
  PAID: "PAID",
  CANCELLED: "CANCELLED",
  FAILED: "FAILED",
  REFUNDED: "REFUNDED",
});

const PAYMENT_TARGET = Object.freeze({
  ORDER: "ORDER",
  AI_PACKAGE: "AI_PACKAGE",
});

function normalizePaymentStatus(status) {
  const normalized = String(status || PAYMENT_STATUS.PENDING).toUpperCase();
  return normalized === "EXPIRED" ? PAYMENT_STATUS.FAILED : normalized;
}

function parseOrderCode(value) {
  const orderCode = Number(value);
  if (!Number.isSafeInteger(orderCode) || orderCode <= 0) {
    const error = new Error("Order code is invalid");
    error.statusCode = 400;
    throw error;
  }
  return orderCode;
}

function getPaymentTarget(payment) {
  return payment.targetType || (payment.aiTransaction ? PAYMENT_TARGET.AI_PACKAGE : PAYMENT_TARGET.ORDER);
}

function parsePayOSDate(value) {
  if (!value) return new Date();

  const raw = String(value).trim();
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)
    ? `${raw.replace(" ", "T")}+07:00`
    : raw;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function getPayOSTransactionData(data = {}) {
  const transactions = Array.isArray(data.transactions) ? data.transactions : [];
  const transaction = transactions[transactions.length - 1] || {};

  return {
    reference: data.reference || transaction.reference || "",
    paidAt: parsePayOSDate(data.transactionDateTime || transaction.transactionDateTime),
  };
}

function assertMatchingAmount(payment, data) {
  const expectedAmount = Number(payment.amount);
  const receivedAmount = Number(data.amountPaid ?? data.amount);

  if (!Number.isFinite(receivedAmount) || receivedAmount !== expectedAmount) {
    const error = new Error("Payment amount does not match");
    error.statusCode = 400;
    throw error;
  }
}

async function withMongoTransaction(work) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

async function generateUniquePayOSOrderCode() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    // Date.now() * 1000 remains below Number.MAX_SAFE_INTEGER and gives 1000 slots per millisecond.
    const orderCode = Date.now() * 1000 + randomInt(0, 1000);
    const [paymentExists, transactionExists] = await Promise.all([
      Payment.exists({ orderCode }),
      AITransaction.exists({ orderCode }),
    ]);
    if (!paymentExists && !transactionExists) {
      return orderCode;
    }
  }

  throw new Error("Cannot generate a unique payOS order code");
}

async function ensureLegacyAIPayment(orderCode) {
  const transaction = await AITransaction.findOne({ orderCode });
  if (!transaction) return null;

  const payment = await Payment.findOneAndUpdate(
    { orderCode },
    {
      $setOnInsert: {
        targetType: PAYMENT_TARGET.AI_PACKAGE,
        aiTransaction: transaction._id,
        user: transaction.user,
        provider: "PAYOS",
        orderCode,
        amount: transaction.amount,
        status: normalizePaymentStatus(transaction.status),
        paymentLinkId: transaction.paymentLinkId || "",
        checkoutUrl: transaction.checkoutUrl || "",
        transactionNo: transaction.transactionNo || "",
        transactionReference: transaction.transactionReference || "",
        paidAt: transaction.paidAt || null,
        rawWebhookPayload: transaction.rawWebhookPayload || null,
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );

  if (!transaction.payment) {
    await AITransaction.updateOne({ _id: transaction._id }, { $set: { payment: payment._id } });
  }

  return payment;
}

async function findPaymentByOrderCode(value, { allowLegacy = true } = {}) {
  const orderCode = parseOrderCode(value);
  const payment = await Payment.findOne({ orderCode });
  if (payment || !allowLegacy) return payment;
  return ensureLegacyAIPayment(orderCode);
}

async function markPaymentPaid(paymentOrId, data, rawPayload = null) {
  const paymentId = paymentOrId._id || paymentOrId;

  return withMongoTransaction(async (session) => {
    const payment = await Payment.findById(paymentId).session(session);
    if (!payment) throw new Error("Payment not found");
    if (normalizePaymentStatus(payment.status) === PAYMENT_STATUS.REFUNDED) return payment;

    assertMatchingAmount(payment, data);
    const targetType = getPaymentTarget(payment);
    const { reference, paidAt } = getPayOSTransactionData(data);

    payment.targetType = targetType;
    payment.status = PAYMENT_STATUS.PAID;
    payment.paidAt = payment.paidAt || paidAt;
    payment.paymentLinkId = data.paymentLinkId || data.id || payment.paymentLinkId;
    payment.transactionReference = reference || payment.transactionReference;
    payment.transactionNo = reference || payment.transactionNo;
    payment.rawWebhookPayload = rawPayload || payment.rawWebhookPayload;
    payment.rawResponse = data;

    if (targetType === PAYMENT_TARGET.ORDER) {
      const order = await Order.findById(payment.order).session(session);
      if (!order) throw new Error("Order not found for payment");

      if (["PENDING_PAYMENT", "pending", "PAID"].includes(order.status)) {
        order.status = "confirmed";
      }
      order.paymentStatus = "paid";
      await order.save({ session });
    } else if (targetType === PAYMENT_TARGET.AI_PACKAGE) {
      const transaction = payment.aiTransaction
        ? await AITransaction.findById(payment.aiTransaction).session(session)
        : await AITransaction.findOne({ orderCode: payment.orderCode }).session(session);

      if (!transaction) throw new Error("AI transaction not found for payment");

      const wasPaid = normalizePaymentStatus(transaction.status) === PAYMENT_STATUS.PAID;
      transaction.payment = payment._id;
      transaction.status = PAYMENT_STATUS.PAID;
      transaction.paidAt = transaction.paidAt || paidAt;
      transaction.paymentLinkId = payment.paymentLinkId;
      transaction.transactionReference = reference || transaction.transactionReference;
      transaction.transactionNo = reference || transaction.transactionNo;
      transaction.rawWebhookPayload = rawPayload || transaction.rawWebhookPayload;

      if (!wasPaid) {
        transaction.creditsGrantedAt = paidAt;
        const creditedUser = await addPaidAiCredits(transaction.user, transaction.credits, {
          UserModel: User,
          session,
        });
        if (!creditedUser) {
          throw new Error("User not found for AI transaction");
        }
      } else if (!transaction.creditsGrantedAt) {
        // Legacy PAID transactions granted credits before this marker existed.
        transaction.creditsGrantedAt = transaction.paidAt || paidAt;
      }

      await transaction.save({ session });
      payment.aiTransaction = transaction._id;
    } else {
      throw new Error("Unsupported payment target");
    }

    await payment.save({ session });
    return payment;
  });
}

async function restoreOrderStock(order, session) {
  for (const item of order.items) {
    const product = await Product.findById(item.product).session(session);
    if (!product) continue;

    product.stock += item.quantity;
    product.sold = Math.max(0, product.sold - item.quantity);
    await product.save({ session });
  }
}

async function markPaymentTerminated(paymentOrId, status, rawResponse = null) {
  const paymentId = paymentOrId._id || paymentOrId;
  const terminalStatus = normalizePaymentStatus(status);
  if (![PAYMENT_STATUS.CANCELLED, PAYMENT_STATUS.FAILED].includes(terminalStatus)) {
    throw new Error("Invalid terminal payment status");
  }

  return withMongoTransaction(async (session) => {
    const payment = await Payment.findById(paymentId).session(session);
    if (!payment) throw new Error("Payment not found");
    if (normalizePaymentStatus(payment.status) === PAYMENT_STATUS.PAID) return payment;

    const targetType = getPaymentTarget(payment);
    payment.targetType = targetType;
    payment.status = terminalStatus;
    payment.rawResponse = rawResponse || payment.rawResponse;

    if (targetType === PAYMENT_TARGET.ORDER) {
      const order = await Order.findById(payment.order).session(session);
      if (order) {
        const orderWasAlreadyClosed = ["cancelled", "refunded", "completed"].includes(order.status);
        if (!payment.stockRestoredAt && !orderWasAlreadyClosed) {
          await restoreOrderStock(order, session);
        }
        payment.stockRestoredAt = payment.stockRestoredAt || new Date();

        if (!orderWasAlreadyClosed) order.status = "cancelled";
        order.paymentStatus = "failed";
        await order.save({ session });
      }
    } else if (targetType === PAYMENT_TARGET.AI_PACKAGE) {
      const transaction = payment.aiTransaction
        ? await AITransaction.findById(payment.aiTransaction).session(session)
        : await AITransaction.findOne({ orderCode: payment.orderCode }).session(session);

      if (transaction && normalizePaymentStatus(transaction.status) !== PAYMENT_STATUS.PAID) {
        transaction.payment = payment._id;
        transaction.status = terminalStatus;
        await transaction.save({ session });
        payment.aiTransaction = transaction._id;
      }
    }

    await payment.save({ session });
    return payment;
  });
}

async function reconcilePayment(paymentOrId) {
  const paymentId = paymentOrId._id || paymentOrId;
  let payment = await Payment.findById(paymentId);
  if (!payment) throw new Error("Payment not found");

  if (normalizePaymentStatus(payment.status) !== PAYMENT_STATUS.PENDING) {
    return payment;
  }

  const payOS = getPayOSClient();
  const paymentLink = await payOS.paymentRequests.get(payment.orderCode);

  if (paymentLink.status === PAYMENT_STATUS.PAID) {
    payment = await markPaymentPaid(payment, paymentLink, paymentLink);
  } else if (["CANCELLED", "FAILED", "EXPIRED"].includes(paymentLink.status)) {
    payment = await markPaymentTerminated(payment, paymentLink.status, paymentLink);
  }

  return payment;
}

module.exports = {
  PAYMENT_STATUS,
  PAYMENT_TARGET,
  findPaymentByOrderCode,
  generateUniquePayOSOrderCode,
  getPaymentTarget,
  markPaymentPaid,
  markPaymentTerminated,
  normalizePaymentStatus,
  parseOrderCode,
  parsePayOSDate,
  reconcilePayment,
};
