const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    provider: {
      type: String,
      enum: ["cod", "momo", "vnpay", "bank_transfer", "stripe", "paypal", "PAYOS"],
      default: "cod",
    },
    orderCode: {
      type: Number,
      unique: true,
      sparse: true,
    },
    paymentLinkId: {
      type: String,
      default: "",
      trim: true,
    },
    checkoutUrl: {
      type: String,
      default: "",
      trim: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ["pending", "paid", "failed", "refunded", "PENDING", "PAID", "CANCELLED", "FAILED"],
      default: "pending",
    },
    transactionNo: {
      type: String,
      default: "",
      trim: true,
    },
    transactionReference: {
      type: String,
      default: "",
      trim: true,
    },
    paidAt: {
      type: Date,
      default: null,
    },
    rawWebhookPayload: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    rawResponse: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  { timestamps: true }
);

paymentSchema.index({ transactionNo: 1 }, { sparse: true });
paymentSchema.index({ order: 1 });
paymentSchema.index({ user: 1 });

module.exports = mongoose.model("Payment", paymentSchema);
