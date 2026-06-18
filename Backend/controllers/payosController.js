const Order = require("../models/Order");
const Payment = require("../models/Payment");
const Product = require("../models/Product");
const { getPayOSClient } = require("../config/payos");

async function restoreOrderStock(order) {
  for (const item of order.items) {
    const product = await Product.findById(item.product);
    if (product) {
      await product.updateStock(item.quantity, "increase");
    }
  }
}

function moveOrderAfterPaid(order) {
  if (["PENDING_PAYMENT", "pending", "PAID"].includes(order.status)) {
    order.status = "confirmed";
  }
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
    const payment = await Payment.findOne({ orderCode: webhookData.orderCode });
    if (!payment) {
      return res.status(404).json({ message: "Payment not found" });
    }

    if (Number(webhookData.amount) !== Number(payment.amount)) {
      return res.status(400).json({ message: "Payment amount does not match" });
    }

    payment.rawWebhookPayload = req.body;
    payment.paymentLinkId = webhookData.paymentLinkId || payment.paymentLinkId;
    payment.transactionReference = webhookData.reference || payment.transactionReference;
    payment.transactionNo = webhookData.reference || payment.transactionNo;

    const isSuccessful =
      req.body.success === true &&
      req.body.code === "00" &&
      webhookData.code === "00";

    if (isSuccessful) {
      payment.status = "PAID";
      payment.paidAt = webhookData.transactionDateTime
        ? new Date(webhookData.transactionDateTime)
        : new Date();
    } else {
      payment.status = "FAILED";
    }

    await payment.save();

    const order = await Order.findById(payment.order);
    if (order) {
      if (isSuccessful) {
        moveOrderAfterPaid(order);
      } else if (!["cancelled", "refunded", "completed"].includes(order.status)) {
        await restoreOrderStock(order);
        order.status = "cancelled";
      }
      order.paymentStatus = isSuccessful ? "paid" : "failed";
      await order.save();
    }

    res.sendStatus(200);
  } catch (error) {
    res.status(500).json({ message: "Cannot handle payOS webhook", error: error.message });
  }
};
