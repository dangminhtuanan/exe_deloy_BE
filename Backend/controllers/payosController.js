const AITransaction = require("../models/AITransaction");
const { getPayOSClient } = require("../config/payos");
const { isStaffRole } = require("../middleware/roleMiddleware");
const {
  getAiCreditBalance,
  grantMonthlyAiCredits,
} = require("../services/monthlyAiCreditService");
const {
  PAYMENT_STATUS,
  PAYMENT_TARGET,
  findPaymentByOrderCode,
  getPaymentTarget,
  markPaymentPaid,
  normalizePaymentStatus,
  reconcilePayment,
} = require("../services/payosPaymentService");

function canAccessPayment(req, payment) {
  return isStaffRole(req.user?.role) || String(payment.user) === String(req.user.id);
}

async function buildPaymentStatus(payment) {
  const targetType = getPaymentTarget(payment);
  const response = {
    orderCode: payment.orderCode,
    paymentId: payment._id,
    targetType,
    paymentStatus: normalizePaymentStatus(payment.status),
    amount: payment.amount,
    paidAt: payment.paidAt,
  };

  if (targetType === PAYMENT_TARGET.ORDER) {
    const populated = await payment.populate("order");
    response.orderId = populated.order?._id || null;
    response.orderStatus = populated.order?.status || null;
  } else {
    const transaction = payment.aiTransaction
      ? await AITransaction.findById(payment.aiTransaction)
      : await AITransaction.findOne({ orderCode: payment.orderCode });
    response.transactionId = transaction?._id || null;
    response.credits = transaction?.credits || 0;

    const monthlyGrant = transaction
      ? await grantMonthlyAiCredits(transaction.user)
      : null;
    const user = monthlyGrant?.user || null;
    const creditBalance = getAiCreditBalance(user);
    response.balance = creditBalance.balance;
    response.monthlyAiCredits = creditBalance.monthlyAiCredits;
    response.paidAiCredits = creditBalance.paidAiCredits;
  }

  return response;
}

exports.handlePayOSWebhook = async (req, res) => {
  let webhookData;

  try {
    const payOS = getPayOSClient();
    webhookData = await payOS.webhooks.verify(req.body);
  } catch (error) {
    return res.status(400).json({ message: "Invalid payOS webhook", error: error.message });
  }

  try {
    // payOS may send a signed sample payload while confirming the webhook URL.
    // Unknown order codes are acknowledged without mutating application data.
    const payment = await findPaymentByOrderCode(webhookData.orderCode);
    if (!payment) {
      console.warn(`payOS webhook ignored: orderCode ${webhookData.orderCode} was not found`);
      return res.sendStatus(200);
    }

    if (req.body.success !== true || req.body.code !== "00" || webhookData.code !== "00") {
      console.warn(`payOS webhook ignored: unsuccessful payload for orderCode ${webhookData.orderCode}`);
      return res.sendStatus(200);
    }

    await markPaymentPaid(payment, webhookData, req.body);
    return res.sendStatus(200);
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      message: "Cannot handle payOS webhook",
      error: error.message,
    });
  }
};

exports.getPayOSPaymentStatus = async (req, res) => {
  try {
    let payment = await findPaymentByOrderCode(req.params.orderCode);
    if (!payment) {
      return res.status(404).json({ message: "Payment not found" });
    }

    if (!canAccessPayment(req, payment)) {
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

    const status = await buildPaymentStatus(payment);
    return res.json({
      message: "Get payOS payment status successfully",
      ...status,
      ...(reconciliationWarning ? { reconciliationWarning } : {}),
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      message: "Cannot get payOS payment status",
      error: error.message,
    });
  }
};

exports.buildPaymentStatus = buildPaymentStatus;
