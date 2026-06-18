const mongoose = require("mongoose");

const shippingSchema = new mongoose.Schema(
  {
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      unique: true,
    },
    shipper: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    shippingStatus: {
      type: String,
      enum: ["pending", "picked_up", "in_transit", "out_for_delivery", "delivered", "failed", "returned", "cancelled"],
      default: "pending",
    },
    trackingNumber: {
      type: String,
      default: "",
      trim: true,
    },
    shippingMethod: {
      type: String,
      enum: ["standard", "express", "overnight"],
      default: "standard",
    },
    estimatedDelivery: {
      type: Date,
      default: null,
    },
    actualDelivery: {
      type: Date,
      default: null,
    },
    pickupTime: {
      type: Date,
      default: null,
    },
    notes: {
      type: String,
      default: "",
      trim: true,
    },
    shippingAddress: {
      street: {
        type: String,
        default: "",
      },
      city: {
        type: String,
        default: "",
      },
      state: {
        type: String,
        default: "",
      },
      zipCode: {
        type: String,
        default: "",
      },
      country: {
        type: String,
        default: "Vietnam",
      },
    },
    shippingCost: {
      type: Number,
      default: 0,
      min: 0,
    },
    weight: {
      type: Number,
      default: 0,
      min: 0,
    },
    dimensions: {
      length: {
        type: Number,
        default: 0,
      },
      width: {
        type: Number,
        default: 0,
      },
      height: {
        type: Number,
        default: 0,
      },
    },
    updates: [
      {
        status: {
          type: String,
          required: true,
        },
        timestamp: {
          type: Date,
          default: Date.now,
        },
        location: {
          type: String,
          default: "",
        },
        notes: {
          type: String,
          default: "",
        },
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Shipping", shippingSchema);
