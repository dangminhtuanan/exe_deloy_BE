const Order = require("../models/Order");
const Payment = require("../models/Payment");
const Product = require("../models/Product");
const Shipping = require("../models/Shipping");
const User = require("../models/User");

const REVENUE_EXCLUDED_STATUSES = [
  "cancelled",
  "refunded",
  "returned",
  "delivery_failed",
  "CANCELLED",
  "FAILED",
];

function parseDateParam(value, fieldName, timezone) {
  if (!value) {
    return null;
  }

  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const timezoneSuffix = timezone === "Asia/Ho_Chi_Minh" ? "+07:00" : "Z";
  const date = new Date(
    isDateOnly
      ? `${value}T${fieldName === "to" ? "23:59:59.999" : "00:00:00.000"}${timezoneSuffix}`
      : value,
  );
  if (Number.isNaN(date.getTime())) {
    const error = new Error(`${fieldName} is invalid`);
    error.statusCode = 400;
    throw error;
  }

  return date;
}

function buildRevenueMatch(query, timezone) {
  const from = parseDateParam(query.from, "from", timezone);
  const to = parseDateParam(query.to, "to", timezone);
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

function buildEffectivePaymentDateMatch(from, to) {
  if (!from && !to) return {};
  const range = {};
  if (from) range.$gte = from;
  if (to) range.$lte = to;
  return {
    $or: [
      { paidAt: range },
      { paidAt: null, createdAt: range },
      { paidAt: { $exists: false }, createdAt: range },
    ],
  };
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
    const timezone = req.query.timezone === "UTC" ? "UTC" : "Asia/Ho_Chi_Minh";
    const { match, from, to } = buildRevenueMatch(req.query, timezone);
    const dateFormat = getDateFormat(groupBy);
    const paymentDateMatch = buildEffectivePaymentDateMatch(from, to);
    const paidPaymentMatch = { ...paymentDateMatch, status: "PAID" };
    const paidOrderIds = await Payment.find({ ...paidPaymentMatch, targetType: "ORDER", order: { $ne: null } }).distinct("order");
    const paidOrderMatch = {
      _id: { $in: paidOrderIds },
      paymentStatus: "paid",
      status: { $nin: REVENUE_EXCLUDED_STATUSES },
    };

    const [
      summaryResult,
      timeline,
      revenueByStatus,
      revenueByPaymentStatus,
      topProducts,
      recentOrders,
      paidOrderSummary,
      totalUsers,
      totalAdmins,
      totalOrders,
      pendingOrders,
      totalPayments,
      paidPayments,
      totalShippings,
      activeShippings,
      totalProducts,
      lowStockProductsCount,
      lowStockProducts,
    ] = await Promise.all([
      Payment.aggregate([
        { $match: paidPaymentMatch },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: "$amount" },
            orderRevenue: { $sum: { $cond: [{ $eq: ["$targetType", "ORDER"] }, "$amount", 0] } },
            aiPackageRevenue: { $sum: { $cond: [{ $eq: ["$targetType", "AI_PACKAGE"] }, "$amount", 0] } },
            paymentCount: { $sum: 1 },
            orderCount: { $sum: { $cond: [{ $eq: ["$targetType", "ORDER"] }, 1, 0] } },
            aiPackageTransactionCount: { $sum: { $cond: [{ $eq: ["$targetType", "AI_PACKAGE"] }, 1, 0] } },
          },
        },
        { $project: { _id: 0 } },
      ]),
      Payment.aggregate([
        { $match: paidPaymentMatch },
        {
          $group: {
            _id: {
              $dateToString: {
                format: dateFormat,
                date: { $ifNull: ["$paidAt", "$createdAt"] },
                timezone,
              },
            },
            revenue: { $sum: "$amount" },
            orderRevenue: { $sum: { $cond: [{ $eq: ["$targetType", "ORDER"] }, "$amount", 0] } },
            aiPackageRevenue: { $sum: { $cond: [{ $eq: ["$targetType", "AI_PACKAGE"] }, "$amount", 0] } },
            transactionCount: { $sum: 1 },
            orderCount: { $sum: { $cond: [{ $eq: ["$targetType", "ORDER"] }, 1, 0] } },
            aiPackageTransactionCount: { $sum: { $cond: [{ $eq: ["$targetType", "AI_PACKAGE"] }, 1, 0] } },
          },
        },
        {
          $project: {
            _id: 0,
            period: "$_id",
            revenue: 1,
            orderRevenue: 1,
            aiPackageRevenue: 1,
            transactionCount: 1,
            orderCount: 1,
            aiPackageTransactionCount: 1,
          },
        },
        { $sort: { period: 1 } },
      ]),
      Order.aggregate([
        { $match: paidOrderMatch },
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
      Payment.aggregate([
        { $match: paymentDateMatch },
        {
          $group: {
            _id: "$status",
            totalAmount: { $sum: "$amount" },
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
        { $match: paidOrderMatch },
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
      Order.find(paidOrderMatch)
        .populate("user", "username email phone")
        .select("customerName phone totalAmount status paymentStatus createdAt user")
        .sort({ createdAt: -1 })
        .limit(limitRecentOrders),
      Order.aggregate([
        { $match: paidOrderMatch },
        { $addFields: { itemCount: { $sum: "$items.quantity" } } },
        { $group: { _id: null, subtotal: { $sum: "$subtotal" }, shippingFee: { $sum: "$shippingFee" }, itemCount: { $sum: "$itemCount" } } },
        { $project: { _id: 0 } },
      ]),
      User.countDocuments(),
      User.countDocuments({ role: "admin" }),
      Order.countDocuments(),
      Order.countDocuments({ status: "pending" }),
      Payment.countDocuments(),
      Payment.countDocuments({ status: "PAID" }),
      Shipping.countDocuments(),
      Shipping.countDocuments({ shippingStatus: { $nin: ["delivered", "failed", "returned", "cancelled"] } }),
      Product.countDocuments({ isActive: true }),
      Product.countDocuments({ isActive: true, stock: { $lte: 5 } }),
      Product.find({ isActive: true, stock: { $lte: 5 } })
        .select("name stock images price")
        .sort({ stock: 1, updatedAt: -1 })
        .limit(6),
    ]);

    const summary = summaryResult[0] || {
      totalRevenue: 0,
      orderRevenue: 0,
      aiPackageRevenue: 0,
      subtotal: 0,
      shippingFee: 0,
      paymentCount: 0,
      orderCount: 0,
      aiPackageTransactionCount: 0,
      itemCount: 0,
      averageOrderValue: 0,
    };
    summary.subtotal = paidOrderSummary[0]?.subtotal || 0;
    summary.shippingFee = paidOrderSummary[0]?.shippingFee || 0;
    summary.itemCount = paidOrderSummary[0]?.itemCount || 0;
    summary.averageOrderValue = summary.orderCount ? summary.orderRevenue / summary.orderCount : 0;

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
      operationalSummary: {
        users: totalUsers,
        admins: totalAdmins,
        orders: totalOrders,
        pendingOrders,
        payments: totalPayments,
        paidPayments,
        shippings: totalShippings,
        activeShippings,
        products: totalProducts,
        lowStock: lowStockProductsCount,
      },
      lowStockProducts,
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      message: error.statusCode ? error.message : "Cannot get revenue report",
      error: error.statusCode ? undefined : error.message,
    });
  }
};
