const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    targetType: {
      type: String,
      enum: ["ORDER", "AI_PACKAGE"],
      default: "ORDER",
      required: true,
    },
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null,
    },
    aiTransaction: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AITransaction",
      default: null,
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
      enum: ["PENDING", "PAID", "CANCELLED", "FAILED", "REFUNDED"],
      default: "PENDING",
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
    stockRestoredAt: {
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
paymentSchema.index({ aiTransaction: 1 });
paymentSchema.index({ user: 1 });

paymentSchema.set("toJSON", {
  transform(document, returnedObject) {
    if (returnedObject.status) returnedObject.status = String(returnedObject.status).toUpperCase();
    return returnedObject;
  },
});

paymentSchema.pre("validate", function normalizeAndValidateTarget(next) {
  if (this.status) {
    this.status = String(this.status).toUpperCase();
  }

  if (!this.targetType) {
    this.targetType = this.aiTransaction ? "AI_PACKAGE" : "ORDER";
  }

  if (this.targetType === "ORDER" && !this.order) {
    this.invalidate("order", "Order payment must reference an order");
  }

  if (this.targetType === "AI_PACKAGE" && !this.aiTransaction) {
    this.invalidate("aiTransaction", "AI package payment must reference an AI transaction");
  }

  next();
});

module.exports = mongoose.model("Payment", paymentSchema);
