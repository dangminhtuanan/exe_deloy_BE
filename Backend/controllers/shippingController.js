const Shipping = require("../models/Shipping");
const Order = require("../models/Order");
const User = require("../models/User");
const { isStaffRole } = require("../middleware/roleMiddleware");
const { parsePagination, buildPagination } = require("../utils/pagination");

function canAccessShipping(req, shipping) {
  const order = shipping.order;
  const orderUser = order?.user?._id || order?.user;
  const shipper = shipping.shipper?._id || shipping.shipper;

  return (
    isStaffRole(req.user?.role) ||
    (orderUser && String(orderUser) === String(req.user.id)) ||
    (shipper && String(shipper) === String(req.user.id))
  );
}

function canCreateShippingForOrder(order) {
  const allowedOrderStatuses = ["confirmed", "packing", "PAID"];
  const blockedOrderStatuses = ["pending", "cancelled", "refunded", "completed"];

  if (blockedOrderStatuses.includes(order.status)) {
    return false;
  }

  if (allowedOrderStatuses.includes(order.status)) {
    return order.paymentStatus === "paid" || order.paymentStatus === "pending" || order.paymentStatus === "unpaid";
  }

  return false;
}

// Get all shipping records (admin/manager only)
exports.getAllShippings = async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) {
      filter.shippingStatus = req.query.status;
    }

    const pagination = parsePagination(req, { defaultLimit: 25, maxLimit: 100 });
    const [shippings, total] = await Promise.all([
      Shipping.find(filter)
        .populate("order")
        .populate("shipper", "username email phone")
        .sort({ createdAt: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit),
      Shipping.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: shippings,
      pagination: buildPagination(total, pagination.page, pagination.limit),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error retrieving shippings",
      error: error.message,
    });
  }
};

// Get shipping details by order ID
exports.getShippingByOrderId = async (req, res) => {
  try {
    const { orderId } = req.params;

    const shipping = await Shipping.findOne({ order: orderId })
      .populate("order")
      .populate("shipper", "username email phone");

    if (!shipping) {
      return res.status(404).json({
        success: false,
        message: "Shipping not found",
      });
    }

    if (!canAccessShipping(req, shipping)) {
      return res.status(403).json({
        success: false,
        message: "Permission denied",
      });
    }

    res.json({
      success: true,
      data: shipping,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error retrieving shipping",
      error: error.message,
    });
  }
};

// Create shipping record for an order
exports.createShipping = async (req, res) => {
  try {
    const {
      orderId,
      shippingMethod = "standard",
      weight = 0,
      dimensions = {},
      shippingCost = 0,
    } = req.body;

    // Check if order exists
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    if (!canCreateShippingForOrder(order)) {
      return res.status(400).json({
        success: false,
        message: "Order is not ready for shipping",
      });
    }

    // Check if shipping record already exists for this order
    const existingShipping = await Shipping.findOne({ order: orderId });
    if (existingShipping) {
      return res.status(400).json({
        success: false,
        message: "Shipping record already exists for this order",
      });
    }

    // Generate tracking number
    const trackingNumber = `TRK${Date.now()}${Math.floor(Math.random() * 10000)}`;

    // Calculate estimated delivery (3-7 days depending on method)
    const estimatedDelivery = new Date();
    const daysToAdd = shippingMethod === "express" ? 2 : shippingMethod === "overnight" ? 1 : 5;
    estimatedDelivery.setDate(estimatedDelivery.getDate() + daysToAdd);

    const shippingData = {
      order: orderId,
      trackingNumber,
      shippingMethod,
      estimatedDelivery,
      weight,
      dimensions,
      shippingCost,
      shippingAddress: {
        street: order.address,
        city: "",
        state: "",
        zipCode: "",
        country: "Vietnam",
      },
      updates: [
        {
          status: "pending",
          timestamp: new Date(),
          notes: "Shipping record created",
        },
      ],
    };

    const shipping = await Shipping.create(shippingData);

    // Update order with shipping reference, but keep it in packing until the shipper picks it up.
    order.shipping = shipping._id;
    if (order.status === "confirmed" || order.status === "PAID") {
      order.status = "packing";
    }
    await order.save();

    const populatedShipping = await Shipping.findById(shipping._id)
      .populate("order")
      .populate("shipper", "username email phone");

    res.status(201).json({
      success: true,
      message: "Shipping record created successfully",
      data: populatedShipping,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error creating shipping record",
      error: error.message,
    });
  }
};

// Assign shipper to shipping
exports.assignShipper = async (req, res) => {
  try {
    const { shippingId } = req.params;
    const { shipperId } = req.body;

    // Check if shipping exists
    const shipping = await Shipping.findById(shippingId);
    if (!shipping) {
      return res.status(404).json({
        success: false,
        message: "Shipping not found",
      });
    }

    if (!canAccessShipping(req, shipping)) {
      return res.status(403).json({
        success: false,
        message: "Permission denied",
      });
    }

    // Check if shipper exists and has shipper role
    const shipper = await User.findById(shipperId);
    if (!shipper) {
      return res.status(404).json({
        success: false,
        message: "Shipper not found",
      });
    }

    if (shipper.role !== "shipper") {
      return res.status(400).json({
        success: false,
        message: "User is not a shipper",
      });
    }

    // Update shipping with shipper
    shipping.shipper = shipperId;
    shipping.updates.push({
      status: "assigned",
      timestamp: new Date(),
      notes: `Shipper ${shipper.username} assigned`,
    });

    await shipping.save();

    // Update order with shipper reference
    await Order.findByIdAndUpdate(shipping.order, { shipper: shipperId });

    const populatedShipping = await Shipping.findById(shippingId)
      .populate("order")
      .populate("shipper", "username email phone");

    res.json({
      success: true,
      message: "Shipper assigned successfully",
      data: populatedShipping,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error assigning shipper",
      error: error.message,
    });
  }
};

// Update shipping status
exports.updateShippingStatus = async (req, res) => {
  try {
    const { shippingId } = req.params;
    const { status, location = "", notes = "" } = req.body;

    const validStatuses = ["pending", "picked_up", "in_transit", "out_for_delivery", "delivered", "failed", "returned"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Valid statuses are: ${validStatuses.join(", ")}`,
      });
    }

    const shipping = await Shipping.findById(shippingId);
    if (!shipping) {
      return res.status(404).json({
        success: false,
        message: "Shipping not found",
      });
    }

    if (!canAccessShipping(req, shipping)) {
      return res.status(403).json({
        success: false,
        message: "Permission denied",
      });
    }

    // Update shipping status
    shipping.shippingStatus = status;
    if (status === "picked_up" && !shipping.pickupTime) {
      shipping.pickupTime = new Date();
    }
    if (status === "delivered" && !shipping.actualDelivery) {
      shipping.actualDelivery = new Date();
    }

    // Add update record
    shipping.updates.push({
      status,
      timestamp: new Date(),
      location,
      notes,
    });

    await shipping.save();

    // Update order status based on shipping status
    const order = await Order.findById(shipping.order);
    if (order) {
      if (status === "delivered") {
        order.status = "completed";
      } else if (status === "failed" || status === "returned") {
        order.status = status === "failed" ? "delivery_failed" : "returned";
      } else if (status === "picked_up" || status === "in_transit" || status === "out_for_delivery") {
        order.status = "shipping";
      }
      await order.save();
    }

    const populatedShipping = await Shipping.findById(shippingId)
      .populate("order")
      .populate("shipper", "username email phone");

    res.json({
      success: true,
      message: "Shipping status updated successfully",
      data: populatedShipping,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error updating shipping status",
      error: error.message,
    });
  }
};

// Get shipping history (tracking updates)
exports.getShippingHistory = async (req, res) => {
  try {
    const { shippingId } = req.params;

    const shipping = await Shipping.findById(shippingId)
      .populate("order")
      .populate("shipper", "username email phone");

    if (!shipping) {
      return res.status(404).json({
        success: false,
        message: "Shipping not found",
      });
    }

    if (!canAccessShipping(req, shipping)) {
      return res.status(403).json({
        success: false,
        message: "Permission denied",
      });
    }

    res.json({
      success: true,
      data: {
        trackingNumber: shipping.trackingNumber,
        updates: shipping.updates,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error retrieving shipping history",
      error: error.message,
    });
  }
};

// Get shipper's assigned shipments
exports.getShipperShipments = async (req, res) => {
  try {
    const { shipperId } = req.params;
    const { status } = req.query;

    if (req.user.role === "shipper" && String(req.user.id) !== String(shipperId)) {
      return res.status(403).json({
        success: false,
        message: "Permission denied",
      });
    }

    const pagination = parsePagination(req, { defaultLimit: 25, maxLimit: 100 });
    let filter = { shipper: shipperId };
    if (status) {
      filter.shippingStatus = status;
    }

    const [shippings, total] = await Promise.all([
      Shipping.find(filter)
        .populate("order")
        .populate("shipper", "username email phone")
        .sort({ createdAt: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit),
      Shipping.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: shippings,
      pagination: buildPagination(total, pagination.page, pagination.limit),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error retrieving shipper shipments",
      error: error.message,
    });
  }
};

// Get current user's shipments (for shipper role)
exports.getMyShipments = async (req, res) => {
  try {
    const userId = req.user.id;
    const { status } = req.query;

    // Check if user is a shipper
    const user = await User.findById(userId);
    if (user.role !== "shipper") {
      return res.status(403).json({
        success: false,
        message: "Only shippers can access this endpoint",
      });
    }

    const pagination = parsePagination(req, { defaultLimit: 25, maxLimit: 100 });
    let filter = { shipper: userId };
    if (status) {
      filter.shippingStatus = status;
    }

    const [shippings, total] = await Promise.all([
      Shipping.find(filter)
        .populate("order")
        .populate("shipper", "username email phone")
        .sort({ createdAt: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit),
      Shipping.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: shippings,
      pagination: buildPagination(total, pagination.page, pagination.limit),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error retrieving your shipments",
      error: error.message,
    });
  }
};

// Update shipping details (address, cost, etc.)
exports.updateShippingDetails = async (req, res) => {
  try {
    const { shippingId } = req.params;
    const {
      shippingAddress,
      shippingCost,
      weight,
      dimensions,
      estimatedDelivery,
      notes,
    } = req.body;

    const shipping = await Shipping.findById(shippingId);
    if (!shipping) {
      return res.status(404).json({
        success: false,
        message: "Shipping not found",
      });
    }

    // Update fields if provided
    if (shippingAddress) shipping.shippingAddress = shippingAddress;
    if (shippingCost !== undefined) shipping.shippingCost = shippingCost;
    if (weight !== undefined) shipping.weight = weight;
    if (dimensions) shipping.dimensions = dimensions;
    if (estimatedDelivery) shipping.estimatedDelivery = new Date(estimatedDelivery);
    if (notes) shipping.notes = notes;

    await shipping.save();

    const populatedShipping = await Shipping.findById(shippingId)
      .populate("order")
      .populate("shipper", "username email phone");

    res.json({
      success: true,
      message: "Shipping details updated successfully",
      data: populatedShipping,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error updating shipping details",
      error: error.message,
    });
  }
};

// Get shipping statistics for shipper
exports.getShipperStatistics = async (req, res) => {
  try {
    const { shipperId } = req.params;

    if (req.user.role === "shipper" && String(req.user.id) !== String(shipperId)) {
      return res.status(403).json({
        success: false,
        message: "Permission denied",
      });
    }

    const shipper = await User.findById(shipperId);
    if (!shipper || shipper.role !== "shipper") {
      return res.status(404).json({
        success: false,
        message: "Shipper not found",
      });
    }

    const shippings = await Shipping.find({ shipper: shipperId });

    const statistics = {
      totalShipments: shippings.length,
      delivered: shippings.filter((s) => s.shippingStatus === "delivered").length,
      inTransit: shippings.filter((s) => s.shippingStatus === "in_transit" || s.shippingStatus === "out_for_delivery").length,
      pending: shippings.filter((s) => s.shippingStatus === "pending" || s.shippingStatus === "picked_up").length,
      failed: shippings.filter((s) => s.shippingStatus === "failed").length,
      returned: shippings.filter((s) => s.shippingStatus === "returned").length,
    };

    res.json({
      success: true,
      data: statistics,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error retrieving shipper statistics",
      error: error.message,
    });
  }
};

// Cancel shipping (return to packing status)
exports.cancelShipping = async (req, res) => {
  try {
    const { shippingId } = req.params;
    const { reason = "" } = req.body;

    const shipping = await Shipping.findById(shippingId);
    if (!shipping) {
      return res.status(404).json({
        success: false,
        message: "Shipping not found",
      });
    }

    if (!canAccessShipping(req, shipping)) {
      return res.status(403).json({
        success: false,
        message: "Permission denied",
      });
    }

    // Can only cancel pending or picked_up shipments
    if (!["pending", "picked_up"].includes(shipping.shippingStatus)) {
      return res.status(400).json({
        success: false,
        message: "Can only cancel pending or picked up shipments",
      });
    }

    shipping.shippingStatus = "cancelled";
    shipping.updates.push({
      status: "cancelled",
      timestamp: new Date(),
      notes: `Cancelled: ${reason}`,
    });

    await shipping.save();

    // Update order status to packing
    await Order.findByIdAndUpdate(shipping.order, { status: "packing" });

    const populatedShipping = await Shipping.findById(shippingId)
      .populate("order")
      .populate("shipper", "username email phone");

    res.json({
      success: true,
      message: "Shipping cancelled successfully",
      data: populatedShipping,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error cancelling shipping",
      error: error.message,
    });
  }
};
