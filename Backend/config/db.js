const dns = require("dns");
const mongoose = require("mongoose");

let connectionPromise = null;

const connectDB = async () => {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  if (connectionPromise) {
    return connectionPromise;
  }

  const mongoUri =
    process.env.MONGO_URI ||
    process.env.MONGODB_URI ||
    (process.env.NODE_ENV === "production"
      ? undefined
      : "mongodb://127.0.0.1:27017/exe201_fashion_shop");

  if (!mongoUri) {
    throw new Error("Missing MONGO_URI or MONGODB_URI");
  }

  if (mongoUri.startsWith("mongodb+srv://") && process.env.DNS_SERVERS) {
    dns.setServers(
      process.env.DNS_SERVERS.split(",")
        .map((server) => server.trim())
        .filter(Boolean),
    );
  }

  connectionPromise = mongoose
    .connect(mongoUri, {
      family: 4,
      serverSelectionTimeoutMS: 10000,
    })
    .then(() => {
      console.log("MongoDB connected");
      return mongoose.connection;
    })
    .catch((error) => {
      connectionPromise = null;
      console.error("MongoDB connection failed:", error.message);
      throw error;
    });

  return connectionPromise;
};

module.exports = connectDB;
