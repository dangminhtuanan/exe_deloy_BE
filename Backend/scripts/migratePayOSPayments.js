const path = require("path");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const connectDB = require("../config/db");
const AITransaction = require("../models/AITransaction");
const Payment = require("../models/Payment");
const {
  PAYMENT_STATUS,
  PAYMENT_TARGET,
  normalizePaymentStatus,
} = require("../services/payosPaymentService");

dotenv.config({ path: path.join(__dirname, "..", ".env"), quiet: true });

async function main() {
  await connectDB();

  await Promise.all([
    Payment.updateMany({ status: "pending" }, { $set: { status: PAYMENT_STATUS.PENDING } }),
    Payment.updateMany({ status: "paid" }, { $set: { status: PAYMENT_STATUS.PAID } }),
    Payment.updateMany({ status: "failed" }, { $set: { status: PAYMENT_STATUS.FAILED } }),
    Payment.updateMany({ status: "refunded" }, { $set: { status: PAYMENT_STATUS.REFUNDED } }),
    AITransaction.updateMany({ status: "pending" }, { $set: { status: PAYMENT_STATUS.PENDING } }),
    AITransaction.updateMany({ status: "paid" }, { $set: { status: PAYMENT_STATUS.PAID } }),
    AITransaction.updateMany({ status: "failed" }, { $set: { status: PAYMENT_STATUS.FAILED } }),
    AITransaction.updateMany({ status: "cancelled" }, { $set: { status: PAYMENT_STATUS.CANCELLED } }),
    Payment.updateMany(
      { targetType: { $exists: false }, order: { $ne: null } },
      { $set: { targetType: PAYMENT_TARGET.ORDER } },
    ),
  ]);

  let migrated = 0;
  let skippedCollisions = 0;
  const cursor = AITransaction.find({ orderCode: { $type: "number" } }).cursor();

  for await (const transaction of cursor) {
    let payment = await Payment.findOne({ orderCode: transaction.orderCode });
    if (payment && payment.order && !payment.aiTransaction) {
      skippedCollisions += 1;
      console.warn(`Skipped cross-type orderCode collision: ${transaction.orderCode}`);
      continue;
    }

    if (!payment) {
      payment = await Payment.create({
        targetType: PAYMENT_TARGET.AI_PACKAGE,
        aiTransaction: transaction._id,
        user: transaction.user,
        provider: "PAYOS",
        orderCode: transaction.orderCode,
        amount: transaction.amount,
        status: normalizePaymentStatus(transaction.status),
        paymentLinkId: transaction.paymentLinkId || "",
        checkoutUrl: transaction.checkoutUrl || "",
        transactionNo: transaction.transactionNo || "",
        transactionReference: transaction.transactionReference || "",
        paidAt: transaction.paidAt || null,
        rawWebhookPayload: transaction.rawWebhookPayload || null,
      });
    } else {
      payment.targetType = PAYMENT_TARGET.AI_PACKAGE;
      payment.aiTransaction = transaction._id;
      payment.status = normalizePaymentStatus(payment.status);
      await payment.save();
    }

    transaction.payment = payment._id;
    transaction.status = normalizePaymentStatus(transaction.status);
    if (transaction.status === PAYMENT_STATUS.PAID && !transaction.creditsGrantedAt) {
      // The legacy handler granted credits before saving PAID, so this marker prevents a replay grant.
      transaction.creditsGrantedAt = transaction.paidAt || transaction.updatedAt || new Date();
    }
    await transaction.save();
    migrated += 1;
  }

  console.log(`Payment migration complete: ${migrated} AI transactions linked, ${skippedCollisions} collisions skipped`);
}

main()
  .catch((error) => {
    console.error(`Payment migration failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
