const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const AITransaction = require("../models/AITransaction");
const Payment = require("../models/Payment");
const {
  PAYMENT_STATUS,
  PAYMENT_TARGET,
  getPaymentTarget,
  normalizePaymentStatus,
  parseOrderCode,
  parsePayOSDate,
} = require("../services/payosPaymentService");

test("normalizes legacy payment statuses", () => {
  assert.equal(normalizePaymentStatus("paid"), PAYMENT_STATUS.PAID);
  assert.equal(normalizePaymentStatus("pending"), PAYMENT_STATUS.PENDING);
  assert.equal(normalizePaymentStatus("expired"), PAYMENT_STATUS.FAILED);
});

test("validates payOS order codes", () => {
  assert.equal(parseOrderCode("1750000000000123"), 1750000000000123);
  assert.throws(() => parseOrderCode("abc"), /invalid/i);
  assert.throws(() => parseOrderCode(-1), /invalid/i);
});

test("parses payOS Vietnam timestamps consistently", () => {
  assert.equal(parsePayOSDate("2026-07-02 12:30:00").toISOString(), "2026-07-02T05:30:00.000Z");
});

test("infers legacy payment targets", () => {
  assert.equal(getPaymentTarget({ order: "order-id" }), PAYMENT_TARGET.ORDER);
  assert.equal(getPaymentTarget({ aiTransaction: "transaction-id" }), PAYMENT_TARGET.AI_PACKAGE);
});

test("models persist canonical uppercase statuses", async () => {
  const id = new mongoose.Types.ObjectId();
  const payment = new Payment({ order: id, user: id, amount: 1000, status: "pending" });
  const transaction = new AITransaction({
    user: id,
    package: id,
    amount: 1000,
    credits: 1,
    status: "paid",
  });

  await Promise.all([payment.validate(), transaction.validate()]);
  assert.equal(payment.status, PAYMENT_STATUS.PENDING);
  assert.equal(transaction.status, PAYMENT_STATUS.PAID);
});
