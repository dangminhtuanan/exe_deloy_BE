const mongoose = require("mongoose");

const issueReportSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    subject: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, required: true, trim: true, maxlength: 3000 },
    status: {
      type: String,
      enum: ["new", "in_progress", "resolved", "rejected"],
      default: "new",
      index: true,
    },
    adminNote: { type: String, trim: true, maxlength: 1000, default: "" },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

issueReportSchema.index({ user: 1, createdAt: -1 });
issueReportSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model("IssueReport", issueReportSchema);
