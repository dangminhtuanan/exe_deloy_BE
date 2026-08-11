const AIPackage = require("../models/AIPackage");
const AITransaction = require("../models/AITransaction");
const Payment = require("../models/Payment");
const User = require("../models/User");
const { getPayOSClient } = require("../config/payos");
const { isStaffRole } = require("../middleware/roleMiddleware");
const {
  addPaidAiCredits,
  deductAiCredits,
  getAiCreditBalance,
  grantMonthlyAiCredits,
} = require("../services/monthlyAiCreditService");
const {
  PAYMENT_STATUS,
  PAYMENT_TARGET,
  findPaymentByOrderCode,
  generateUniquePayOSOrderCode,
  getPaymentTarget,
  normalizePaymentStatus,
  reconcilePayment,
} = require("../services/payosPaymentService");

// Public: Get all available AI packages
exports.getAvailablePackages = async (req, res) => {
  try {
    const packages = await AIPackage.find({ active: true }).sort({ displayOrder: 1, price: 1 });
    res.json({ message: "Get packages successfully", packages });
  } catch (error) {
    res.status(500).json({ message: "Cannot get packages", error: error.message });
  }
};

// Admin/Manager: Get all packages (including inactive)
exports.getAllPackages = async (req, res) => {
  try {
    const packages = await AIPackage.find().sort({ displayOrder: 1, price: 1 });
    res.json({ message: "Get all packages successfully", packages });
  } catch (error) {
    res.status(500).json({ message: "Cannot get packages", error: error.message });
  }
};

// Admin/Manager: Create a new AI package
exports.createPackage = async (req, res) => {
  try {
    const { name, description, price, credits, features, duration, displayOrder, isTrial } = req.body;

    if (!name || price === undefined || !credits) {
      return res.status(400).json({ message: "Missing required fields: name, price, credits" });
    }

    const existingPackage = await AIPackage.findOne({ name });
    if (existingPackage) {
      return res.status(400).json({ message: "Package name already exists" });
    }

    const newPackage = await AIPackage.create({
      name,
      description,
      price,
      credits,
      features: features || [],
      duration: duration || "one-time",
      isTrial: Boolean(isTrial),
      displayOrder: displayOrder || 0,
    });

    res.status(201).json({ message: "Create package successfully", package: newPackage });
  } catch (error) {
    res.status(500).json({ message: "Cannot create package", error: error.message });
  }
};

// Admin/Manager: Update AI package
exports.updatePackage = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const aiPackage = await AIPackage.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    });

    if (!aiPackage) {
      return res.status(404).json({ message: "Package not found" });
    }

    res.json({ message: "Update package successfully", package: aiPackage });
  } catch (error) {
    res.status(500).json({ message: "Cannot update package", error: error.message });
  }
};

// Admin/Manager: Delete AI package
exports.deletePackage = async (req, res) => {
  try {
    const { id } = req.params;
    const aiPackage = await AIPackage.findByIdAndDelete(id);

    if (!aiPackage) {
      return res.status(404).json({ message: "Package not found" });
    }

    res.json({ message: "Delete package successfully", package: aiPackage });
  } catch (error) {
    res.status(500).json({ message: "Cannot delete package", error: error.message });
  }
};

// User: Get their AI transactions
exports.getMyTransactions = async (req, res) => {
  try {
    const transactions = await AITransaction.find({ user: req.user.id })
      .populate("package", "name credits price isTrial")
      .populate("payment")
      .sort({ createdAt: -1 });

    res.json({ message: "Get transactions successfully", transactions });
  } catch (error) {
    res.status(500).json({ message: "Cannot get transactions", error: error.message });
  }
};

// User: Get their AI credits balance
exports.getMyCreditsBalance = async (req, res) => {
  try {
    const monthlyGrant = await grantMonthlyAiCredits(req.user.id);
    const user = monthlyGrant.user;

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const creditBalance = getAiCreditBalance(user);

    res.json({
      message: "AI credits balance retrieved successfully",
      balance: creditBalance.balance,
      monthlyAiCredits: creditBalance.monthlyAiCredits,
      paidAiCredits: creditBalance.paidAiCredits,
      userId: user._id,
      monthlyGrant: {
        granted: monthlyGrant.granted,
        credits: monthlyGrant.creditsGranted,
        period: monthlyGrant.period,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Cannot get credits balance", error: error.message });
  }
};

// User: Purchase AI package with PayOS
exports.purchasePackage = async (req, res) => {
  try {
    const { packageId } = req.body;

    const aiPackage = await AIPackage.findById(packageId);
    if (!aiPackage) {
      return res.status(404).json({ message: "Package not found" });
    }

    if (!aiPackage.active) {
      return res.status(400).json({ message: "Package is not available" });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (aiPackage.isTrial) {
      // This also covers purchases made before trialPurchaseKey was introduced.
      const previousTrialPurchase = await AITransaction.findOne({
        user: user._id,
        $or: [{ isTrial: true }, { package: aiPackage._id }],
        status: { $in: ["pending", "PENDING", "paid", "PAID"] },
      }).lean();

      if (previousTrialPurchase) {
        return res.status(409).json({
          message: ["paid", "PAID"].includes(previousTrialPurchase.status)
            ? "Mỗi tài khoản chỉ được mua gói dùng thử một lần"
            : "Tài khoản đang có giao dịch gói dùng thử chờ thanh toán",
          code: ["paid", "PAID"].includes(previousTrialPurchase.status)
            ? "TRIAL_ALREADY_PURCHASED"
            : "TRIAL_ALREADY_RESERVED",
        });
      }
    }

    const amount = Math.round(Number(aiPackage.price));
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      return res.status(400).json({ message: "Package price must be a positive VND integer" });
    }

    const orderCode = await generateUniquePayOSOrderCode();

    // Create transaction
    let transaction;
    try {
      transaction = await AITransaction.create({
        user: user._id,
        package: aiPackage._id,
        amount,
        credits: aiPackage.credits,
        isTrial: aiPackage.isTrial,
        provider: "PAYOS",
        orderCode,
        status: PAYMENT_STATUS.PENDING,
        trialPurchaseKey: aiPackage.isTrial ? String(user._id) : undefined,
      });
    } catch (error) {
      if (aiPackage.isTrial && error?.code === 11000) {
        return res.status(409).json({
          message: "Tài khoản đã mua hoặc đang thanh toán gói dùng thử",
          code: "TRIAL_ALREADY_RESERVED",
        });
      }
      throw error;
    }

    let payment = null;
    try {
      payment = await Payment.create({
        targetType: PAYMENT_TARGET.AI_PACKAGE,
        aiTransaction: transaction._id,
        user: user._id,
        provider: "PAYOS",
        orderCode,
        amount,
        status: PAYMENT_STATUS.PENDING,
      });
      transaction.payment = payment._id;
      await transaction.save();

      const payOS = getPayOSClient();
      const paymentLinkData = {
        orderCode,
        amount,
        description: `AIPKG${orderCode}`,
        items: [
          {
            name: aiPackage.name.slice(0, 100),
            quantity: 1,
            price: amount,
          },
        ],
        buyerEmail: user.email,
        buyerName: user.username,
        ...(user.phone ? { buyerPhone: user.phone } : {}),
        returnUrl: `${process.env.FRONTEND_URL || "http://localhost:5173"}/ai/payment-result`,
        cancelUrl: `${process.env.FRONTEND_URL || "http://localhost:5173"}/ai/cancel`,
      };

      const paymentLink = await payOS.paymentRequests.create(paymentLinkData);

      payment.paymentLinkId = paymentLink.paymentLinkId || "";
      payment.checkoutUrl = paymentLink.checkoutUrl;
      payment.rawResponse = paymentLink;
      transaction.paymentLinkId = paymentLink.paymentLinkId || "";
      transaction.checkoutUrl = paymentLink.checkoutUrl;
      await Promise.all([payment.save(), transaction.save()]);

      res.status(201).json({
        message: "Payment link created successfully",
        transaction: {
          id: transaction._id,
          paymentId: payment._id,
          orderCode,
          checkoutUrl: paymentLink.checkoutUrl,
          amount: transaction.amount,
          packageName: aiPackage.name,
        },
      });
    } catch (payosError) {
      transaction.status = PAYMENT_STATUS.FAILED;
      if (payment) payment.status = PAYMENT_STATUS.FAILED;
      transaction.trialPurchaseKey = undefined;
      await Promise.all([transaction.save(), ...(payment ? [payment.save()] : [])]);

      res.status(500).json({
        message: "Failed to create payment link",
        error: payosError.message,
      });
    }
  } catch (error) {
    res.status(500).json({ message: "Cannot purchase package", error: error.message });
  }
};

// User: Get transaction details
exports.getTransactionDetails = async (req, res) => {
  try {
    const { transactionId } = req.params;

    const transaction = await AITransaction.findById(transactionId)
      .populate("package", "name credits features price")
      .populate("payment");

    if (!transaction) {
      return res.status(404).json({ message: "Transaction not found" });
    }

    // Check access
    if (String(transaction.user) !== String(req.user.id) && !isStaffRole(req.user?.role)) {
      return res.status(403).json({ message: "Permission denied" });
    }

    res.json({ message: "Get transaction successfully", transaction });
  } catch (error) {
    res.status(500).json({ message: "Cannot get transaction", error: error.message });
  }
};

// Admin: Get all transactions
exports.getAllTransactions = async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) {
      const status = normalizePaymentStatus(req.query.status);
      filter.status = { $in: [status, status.toLowerCase()] };
    }
    if (req.query.provider) filter.provider = req.query.provider;

    const transactions = await AITransaction.find(filter)
      .populate("user", "username email phone")
      .populate("package", "name credits price")
      .populate("payment")
      .sort({ createdAt: -1 });

    res.json({ message: "Get all transactions successfully", transactions });
  } catch (error) {
    res.status(500).json({ message: "Cannot get transactions", error: error.message });
  }
};

// User: Reconcile and get AI package payment status by payOS order code.
exports.getPackagePaymentStatus = async (req, res) => {
  try {
    let payment = await findPaymentByOrderCode(req.params.orderCode);
    if (!payment || getPaymentTarget(payment) !== PAYMENT_TARGET.AI_PACKAGE) {
      return res.status(404).json({ message: "AI package payment not found" });
    }

    if (String(payment.user) !== String(req.user.id) && !isStaffRole(req.user?.role)) {
      return res.status(403).json({ message: "Permission denied" });
    }

    let reconciliationWarning = null;
    if (normalizePaymentStatus(payment.status) === PAYMENT_STATUS.PENDING) {
      try {
        payment = await reconcilePayment(payment);
      } catch (error) {
        reconciliationWarning = error.message;
      }
    }

    const transaction = payment.aiTransaction
      ? await AITransaction.findById(payment.aiTransaction).populate("package", "name credits price")
      : await AITransaction.findOne({ orderCode: payment.orderCode }).populate("package", "name credits price");
    const monthlyGrant = await grantMonthlyAiCredits(payment.user);
    const paymentUser = monthlyGrant.user;
    const creditBalance = getAiCreditBalance(paymentUser);

    return res.json({
      message: "Get AI package payment status successfully",
      orderCode: payment.orderCode,
      paymentId: payment._id,
      transactionId: transaction?._id || null,
      paymentStatus: normalizePaymentStatus(payment.status),
      amount: payment.amount,
      credits: transaction?.credits || 0,
      balance: creditBalance.balance,
      monthlyAiCredits: creditBalance.monthlyAiCredits,
      paidAiCredits: creditBalance.paidAiCredits,
      paidAt: payment.paidAt,
      ...(reconciliationWarning ? { reconciliationWarning } : {}),
    });
    if (Number(webhookData.amount) !== Number(transaction.amount)) {
      return res.status(400).json({ message: "Payment amount does not match" });
    }

    transaction.rawWebhookPayload = req.body;
    transaction.paymentLinkId = webhookData.paymentLinkId || transaction.paymentLinkId;
    transaction.transactionReference = webhookData.reference || transaction.transactionReference;
    transaction.transactionNo = webhookData.reference || transaction.transactionNo;

    const isSuccessful = req.body.success === true && req.body.code === "00" && webhookData.code === "00";

    if (isSuccessful) {
      transaction.status = "PAID";
      transaction.paidAt = webhookData.transactionDateTime
        ? new Date(webhookData.transactionDateTime)
        : new Date();

      // Add credits to user
      const user = await User.findById(transaction.user);
      if (user) {
        user.aiCredits = (user.aiCredits || 0) + transaction.credits;
        await user.save();
      }
    } else {
      transaction.status = "FAILED";
      transaction.trialPurchaseKey = undefined;
    }

    await transaction.save();

    res.sendStatus(200);
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      message: "Cannot get AI package payment status",
      error: error.message,
    });
  }
};

// Admin: Manually add credits to user
exports.addCreditsToUser = async (req, res) => {
  try {
    const { userId, credits, reason = "Admin addition" } = req.body;
    const creditsToAdd = Number(credits);

    if (!userId || !Number.isSafeInteger(creditsToAdd) || creditsToAdd <= 0) {
      return res.status(400).json({ message: "Invalid userId or credits" });
    }

    const user = await addPaidAiCredits(userId, creditsToAdd);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const creditBalance = getAiCreditBalance(user);

    res.json({
      message: "Credits added successfully",
      userId: user._id,
      creditsAdded: creditsToAdd,
      reason,
      newBalance: creditBalance.balance,
      monthlyAiCredits: creditBalance.monthlyAiCredits,
      paidAiCredits: creditBalance.paidAiCredits,
    });
  } catch (error) {
    res.status(500).json({ message: "Cannot add credits", error: error.message });
  }
};

// User: Use AI credits
exports.useAiCredits = async (req, res) => {
  try {
    const credits = Number(req.body.credits ?? 1);

    if (!Number.isSafeInteger(credits) || credits <= 0) {
      return res.status(400).json({ message: "Credits must be a positive integer" });
    }

    const deduction = await deductAiCredits(req.user.id, credits);
    if (!deduction.monthlyGrant.user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!deduction.user) {
      if (!deduction.currentUser) {
        return res.status(404).json({ message: "User not found" });
      }

      const currentBalance = getAiCreditBalance(deduction.currentUser);

      return res.status(400).json({
        message: "Insufficient credits",
        currentBalance: currentBalance.balance,
        monthlyAiCredits: currentBalance.monthlyAiCredits,
        paidAiCredits: currentBalance.paidAiCredits,
        required: credits,
      });
    }

    const remaining = getAiCreditBalance(deduction.user);

    res.json({
      message: "Credits used successfully",
      creditsUsed: credits,
      remainingBalance: remaining.balance,
      monthlyAiCredits: remaining.monthlyAiCredits,
      paidAiCredits: remaining.paidAiCredits,
    });
  } catch (error) {
    res.status(500).json({ message: "Cannot use credits", error: error.message });
  }
};
