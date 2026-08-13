const express = require("express");
const dotenv = require("dotenv");
const path = require("path");
const cors = require("cors");
const connectDB = require("./config/db");
const swaggerDocs = require("./swagger");

dotenv.config({ path: path.join(__dirname, ".env"), quiet: true });

const app = express();

app.use(express.json());
app.use(cors());

app.use("/image", express.static(path.join(__dirname, "image")));

app.get("/", (req, res) => {
  res.send("API is running. Open /docs for Swagger.");
});

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

swaggerDocs(app);

app.use("/api", async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    res.status(500).json({
      message: "Database connection failed",
      error: error.message,
    });
  }
});

const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const profileRoutes = require("./routes/profileRoutes");
const categoryRoutes = require("./routes/categoryRoutes");
const productRoutes = require("./routes/productRoutes");
const cartRoutes = require("./routes/cartRoutes");
const orderRoutes = require("./routes/orderRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const reviewRoutes = require("./routes/reviewRoutes");
const aiRoutes = require("./routes/aiRoutes");
const aiPackageRoutes = require("./routes/aiPackageRoutes");
const payosRoutes = require("./routes/payosRoutes");
const shippingRoutes = require("./routes/shippingRoutes");
const uploadRoutes = require("./routes/uploadRoutes");
const reportRoutes = require("./routes/reportRoutes");
const accessLogRoutes = require("./routes/accessLogRoutes");
const issueReportRoutes = require("./routes/issueReportRoutes");

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api", profileRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/products", productRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/ai-packages", aiPackageRoutes);
app.use("/api/payos", payosRoutes);
app.use("/api/shipping", shippingRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/access-logs", accessLogRoutes);
app.use("/api/issue-reports", issueReportRoutes);

module.exports = app;
