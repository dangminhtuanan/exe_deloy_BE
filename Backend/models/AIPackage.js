const mongoose = require("mongoose");

const aiPackageSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    credits: {
      type: Number,
      required: true,
      min: 1,
      description: "Number of AI feature uses included",
    },
    features: {
      type: [String],
      default: [],
    },
    duration: {
      type: String,
      enum: ["one-time", "monthly", "yearly"],
      default: "one-time",
    },
    active: {
      type: Boolean,
      default: true,
    },
    displayOrder: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AIPackage", aiPackageSchema);
