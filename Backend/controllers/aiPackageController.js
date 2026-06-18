const AIPackage = require("../models/AIPackage");
const AITransaction = require("../models/AITransaction");
const User = require("../models/User");
const { getPayOSClient } = require("../config/payos");
const { isStaffRole } = require("../middleware/roleMiddleware");

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
    const { name, description, price, credits, features, duration, displayOrder } = req.body;

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
      .populate("package", "name credits price")
      .sort({ createdAt: -1 });

    res.json({ message: "Get transactions successfully", transactions });
  } catch (error) {
    res.status(500).json({ message: "Cannot get transactions", error: error.message });
  }
};

// User: Get their AI credits balance
exports.getMyCreditsBalance = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      message: "Get credits balance successfully",
      balance: user.aiCredits || 0,
      userId: user._id,
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

    // Create transaction
    const transaction = await AITransaction.create({
      user: user._id,
      package: aiPackage._id,
      amount: aiPackage.price,
      credits: aiPackage.credits,
      provider: "PAYOS",
      status: "pending",
    });

    // Generate PayOS order code (timestamp-based, unique)
    const orderCode = Math.floor(Date.now() / 1000);
    transaction.orderCode = orderCode;
    await transaction.save();

    try {
      // Create payment link with PayOS
      const payOS = getPayOSClient();
      const paymentLinkData = {
        orderCode: orderCode,
        amount: Math.round(aiPackage.price),
        description: `AI Package: ${aiPackage.name}`,
        items: [
          {
            name: aiPackage.name,
            quantity: 1,
            price: Math.round(aiPackage.price),
          },
        ],
        buyerEmail: user.email,
        buyerName: user.username,
        buyerPhone: user.phone || "",
        returnUrl: `${process.env.FRONTEND_URL || "http://localhost:5173"}/ai/payment-result?orderCode=${orderCode}`,
        cancelUrl: `${process.env.FRONTEND_URL || "http://localhost:5173"}/ai/cancel?orderCode=${orderCode}`,
      };

      const paymentLink = await payOS.paymentRequests.create(paymentLinkData);

      transaction.paymentLinkId = paymentLink.paymentLinkId || "";
      transaction.checkoutUrl = paymentLink.checkoutUrl;
      await transaction.save();

      res.status(201).json({
        message: "Payment link created successfully",
        transaction: {
          id: transaction._id,
          orderCode: transaction.orderCode,
          checkoutUrl: paymentLink.checkoutUrl,
          amount: transaction.amount,
          packageName: aiPackage.name,
        },
      });
    } catch (payosError) {
      // If PayOS fails, mark transaction as failed
      transaction.status = "failed";
      await transaction.save();

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

    const transaction = await AITransaction.findById(transactionId).populate(
      "package",
      "name credits features price"
    );

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
    if (req.query.status) filter.status = req.query.status;
    if (req.query.provider) filter.provider = req.query.provider;

    const transactions = await AITransaction.find(filter)
      .populate("user", "username email phone")
      .populate("package", "name credits price")
      .sort({ createdAt: -1 });

    res.json({ message: "Get all transactions successfully", transactions });
  } catch (error) {
    res.status(500).json({ message: "Cannot get transactions", error: error.message });
  }
};

// PayOS Webhook: Handle payment confirmation
exports.handlePaymentWebhook = async (req, res) => {

    if (!req.body || Object.keys(req.body).length === 0) {
    return res.status(400).json({ 
      message: "Lỗi: Request Body trống rỗng! Vui lòng nhập dữ liệu đơn hàng trước khi bấm Execute." 
    });
  }
  
  let webhookData;
  webhookData = req.body.data || req.body;

//   try {
//     const payOS = getPayOSClient();
//     webhookData = await payOS.webhooks.verify(req.body);
//   } catch (error) {
//     return res.status(400).json({ message: "Invalid PayOS webhook", error: error.message });
//   }

  try {
    const transaction = await AITransaction.findOne({ orderCode: webhookData.orderCode });

    if (!transaction) {
      return res.status(404).json({ message: "Transaction not found" });
    }

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
    }

    await transaction.save();

    res.sendStatus(200);
  } catch (error) {
    res.status(500).json({ message: "Cannot handle webhook", error: error.message });
  }
};

// Admin: Manually add credits to user
exports.addCreditsToUser = async (req, res) => {
  try {
    const { userId, credits, reason = "Admin addition" } = req.body;

    if (!userId || !credits || credits <= 0) {
      return res.status(400).json({ message: "Invalid userId or credits" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.aiCredits = (user.aiCredits || 0) + credits;
    await user.save();

    res.json({
      message: "Credits added successfully",
      userId: user._id,
      newBalance: user.aiCredits,
    });
  } catch (error) {
    res.status(500).json({ message: "Cannot add credits", error: error.message });
  }
};

// User: Use AI credits
exports.useAiCredits = async (req, res) => {
  try {
    const { credits = 1 } = req.body;

    if (credits <= 0) {
      return res.status(400).json({ message: "Credits must be greater than 0" });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const currentBalance = user.aiCredits || 0;
    if (currentBalance < credits) {
      return res.status(400).json({
        message: "Insufficient credits",
        currentBalance,
        required: credits,
      });
    }

    user.aiCredits = currentBalance - credits;
    await user.save();

    res.json({
      message: "Credits used successfully",
      creditsUsed: credits,
      remainingBalance: user.aiCredits,
    });
  } catch (error) {
    res.status(500).json({ message: "Cannot use credits", error: error.message });
  }
};
