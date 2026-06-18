const Order = require("../models/Order");

const REVENUE_EXCLUDED_STATUSES = [
  "cancelled",
  "refunded",
  "returned",
  "delivery_failed",
  "CANCELLED",
  "FAILED",
];

function parseDateParam(value, fieldName) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    const error = new Error(`${fieldName} is invalid`);
    error.statusCode = 400;
    throw error;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value) && fieldName === "to") {
    date.setHours(23, 59, 59, 999);
  }

  return date;
}

function buildRevenueMatch(query) {
  const from = parseDateParam(query.from, "from");
  const to = parseDateParam(query.to, "to");
  const match = {
    paymentStatus: "paid",
    status: { $nin: REVENUE_EXCLUDED_STATUSES },
  };

  if (from || to) {
    match.createdAt = {};
    if (from) match.createdAt.$gte = from;
    if (to) match.createdAt.$lte = to;
  }

  return { match, from, to };
}

function getDateFormat(groupBy) {
  switch (groupBy) {
    case "year":
      return "%Y";
    case "month":
      return "%Y-%m";
    case "day":
    default:
      return "%Y-%m-%d";
  }
}

exports.getRevenueReport = async (req, res) => {
  try {
    const groupBy = ["day", "month", "year"].includes(req.query.groupBy)
      ? req.query.groupBy
      : "day";
    const limitTopProducts = Math.min(Math.max(Number(req.query.limitTopProducts) || 5, 1), 20);
    const limitRecentOrders = Math.min(Math.max(Number(req.query.limitRecentOrders) || 10, 1), 50);
    const timezone = req.query.timezone || "Asia/Ho_Chi_Minh";
    const { match, from, to } = buildRevenueMatch(req.query);
    const dateFormat = getDateFormat(groupBy);

    const [
      summaryResult,
      timeline,
      revenueByStatus,
      revenueByPaymentStatus,
      topProducts,
      recentOrders,
    ] = await Promise.all([
      Order.aggregate([
        { $match: match },
        {
          $addFields: {
            itemCount: { $sum: "$items.quantity" },
          },
        },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: "$totalAmount" },
            subtotal: { $sum: "$subtotal" },
            tax: { $sum: "$tax" },
            shippingFee: { $sum: "$shippingFee" },
            orderCount: { $sum: 1 },
            itemCount: { $sum: "$itemCount" },
            averageOrderValue: { $avg: "$totalAmount" },
          },
        },
        { $project: { _id: 0 } },
      ]),
      Order.aggregate([
        { $match: match },
        {
          $group: {
            _id: {
              $dateToString: {
                format: dateFormat,
                date: "$createdAt",
                timezone,
              },
            },
            revenue: { $sum: "$totalAmount" },
            orderCount: { $sum: 1 },
          },
        },
        {
          $project: {
            _id: 0,
            period: "$_id",
            revenue: 1,
            orderCount: 1,
          },
        },
        { $sort: { period: 1 } },
      ]),
      Order.aggregate([
        { $match: match },
        {
          $group: {
            _id: "$status",
            revenue: { $sum: "$totalAmount" },
            orderCount: { $sum: 1 },
          },
        },
        {
          $project: {
            _id: 0,
            status: "$_id",
            revenue: 1,
            orderCount: 1,
          },
        },
        { $sort: { revenue: -1 } },
      ]),
      Order.aggregate([
        {
          $match: {
            ...(match.createdAt ? { createdAt: match.createdAt } : {}),
            paymentStatus: { $in: ["unpaid", "pending", "paid", "failed", "refunded"] },
          },
        },
        {
          $group: {
            _id: "$paymentStatus",
            totalAmount: { $sum: "$totalAmount" },
            orderCount: { $sum: 1 },
          },
        },
        {
          $project: {
            _id: 0,
            paymentStatus: "$_id",
            totalAmount: 1,
            orderCount: 1,
          },
        },
        { $sort: { orderCount: -1 } },
      ]),
      Order.aggregate([
        { $match: match },
        { $unwind: "$items" },
        {
          $group: {
            _id: "$items.product",
            name: { $first: "$items.name" },
            quantity: { $sum: "$items.quantity" },
            revenue: { $sum: "$items.subtotal" },
            orderIds: { $addToSet: "$_id" },
          },
        },
        {
          $project: {
            _id: 0,
            product: "$_id",
            name: 1,
            quantity: 1,
            revenue: 1,
            orderCount: { $size: "$orderIds" },
          },
        },
        { $sort: { revenue: -1, quantity: -1 } },
        { $limit: limitTopProducts },
      ]),
      Order.find(match)
        .populate("user", "username email phone")
        .select("customerName phone totalAmount status paymentStatus createdAt user")
        .sort({ createdAt: -1 })
        .limit(limitRecentOrders),
    ]);

    const summary = summaryResult[0] || {
      totalRevenue: 0,
      subtotal: 0,
      tax: 0,
      shippingFee: 0,
      orderCount: 0,
      itemCount: 0,
      averageOrderValue: 0,
    };

    res.json({
      message: "Get revenue report successfully",
      filters: {
        from,
        to,
        groupBy,
        timezone,
      },
      summary,
      timeline,
      revenueByStatus,
      revenueByPaymentStatus,
      topProducts,
      recentOrders,
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      message: error.statusCode ? error.message : "Cannot get revenue report",
      error: error.statusCode ? undefined : error.message,
    });
  }
};
