const mongoose = require("mongoose");

const chatbotLogSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    question: {
      type: String,
      required: true,
      trim: true,
    },
    answer: {
      type: String,
      default: "",
      trim: true,
    },
    intent: {
      type: String,
      default: "general",
      trim: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

chatbotLogSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model("ChatbotLog", chatbotLogSchema);
