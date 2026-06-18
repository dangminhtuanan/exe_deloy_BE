const express = require("express");
const { handlePayOSWebhook } = require("../controllers/payosController");

const router = express.Router();

router.post("/webhook", handlePayOSWebhook);

module.exports = router;