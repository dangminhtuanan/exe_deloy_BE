const test = require("node:test");
const assert = require("node:assert/strict");

const {
  MONTHLY_AI_CREDITS,
  addPaidAiCredits,
  deductAiCredits,
  getAiCreditBalance,
  getMonthlyCreditPeriod,
  grantMonthlyAiCredits,
} = require("../services/monthlyAiCreditService");

function createFakeUserModel(initialUser) {
  let state = initialUser ? { ...initialUser } : null;
  const updateCalls = [];

  return {
    get state() {
      return state;
    },
    updateCalls,
    async findById() {
      return state ? { ...state } : null;
    },
    async findOneAndUpdate(filter, update) {
      updateCalls.push({ filter, update });
      if (!state || state._id !== filter._id) return null;

      if (filter.$or) {
        const needsMigration =
          !Object.hasOwn(state, "monthlyAiCredits") || !Object.hasOwn(state, "paidAiCredits");
        if (!needsMigration) return null;

        const monthly = Number(state.monthlyAiCredits) || 0;
        const paid = Object.hasOwn(state, "paidAiCredits")
          ? Number(state.paidAiCredits) || 0
          : Math.max((Number(state.aiCredits) || 0) - monthly, 0);
        state.monthlyAiCredits = monthly;
        state.paidAiCredits = paid;
        state.aiCredits = monthly + paid;
        state.monthlyAiCreditPeriod = null;
        state.monthlyAiCreditGrantedAt = null;
        return { ...state };
      }

      if (filter.monthlyAiCreditPeriod) {
        const period = filter.monthlyAiCreditPeriod.$ne;
        if (state.monthlyAiCreditPeriod === period) return null;

        state.monthlyAiCredits = MONTHLY_AI_CREDITS;
        state.paidAiCredits = Number(state.paidAiCredits) || 0;
        state.aiCredits = state.monthlyAiCredits + state.paidAiCredits;
        state.monthlyAiCreditPeriod = period;
        state.monthlyAiCreditGrantedAt = update[0].$set.monthlyAiCreditGrantedAt;
        return { ...state };
      }

      if (filter.$expr) {
        const amount = filter.$expr.$gte[1];
        const balance = state.monthlyAiCredits + state.paidAiCredits;
        if (balance < amount) return null;

        const freeDeduction = Math.min(state.monthlyAiCredits, amount);
        state.monthlyAiCredits -= freeDeduction;
        state.paidAiCredits -= amount - freeDeduction;
        state.aiCredits = state.monthlyAiCredits + state.paidAiCredits;
        return { ...state };
      }

      if (update.$inc?.paidAiCredits) {
        state.paidAiCredits += update.$inc.paidAiCredits;
        state.aiCredits += update.$inc.aiCredits;
        return { ...state };
      }

      throw new Error("Unexpected test update");
    },
  };
}

test("monthly credit amount is 3 and period follows Vietnam time", () => {
  assert.equal(MONTHLY_AI_CREDITS, 3);
  assert.equal(getMonthlyCreditPeriod(new Date("2026-07-31T16:59:59.000Z")), "2026-07");
  assert.equal(getMonthlyCreditPeriod(new Date("2026-07-31T17:00:00.000Z")), "2026-08");
});

test("a new user receives exactly 3 monthly credits", async () => {
  const UserModel = createFakeUserModel({
    _id: "user-1",
    aiCredits: 0,
    monthlyAiCredits: 0,
    paidAiCredits: 0,
  });

  const result = await grantMonthlyAiCredits("user-1", {
    UserModel,
    now: new Date("2026-07-03T01:00:00.000Z"),
  });

  assert.equal(result.granted, true);
  assert.deepEqual(getAiCreditBalance(result.user), {
    monthlyAiCredits: 3,
    paidAiCredits: 0,
    balance: 3,
  });
});

test("parallel calls only reset monthly credits once", async () => {
  const UserModel = createFakeUserModel({
    _id: "user-1",
    aiCredits: 0,
    monthlyAiCredits: 0,
    paidAiCredits: 0,
  });
  const options = { UserModel, now: new Date("2026-07-03T01:00:00.000Z") };

  const results = await Promise.all([
    grantMonthlyAiCredits("user-1", options),
    grantMonthlyAiCredits("user-1", options),
  ]);

  assert.equal(results.filter((result) => result.granted).length, 1);
  assert.equal(UserModel.state.monthlyAiCredits, 3);
  assert.equal(UserModel.state.aiCredits, 3);
});

test("a second call in the same month does not restore spent free credits", async () => {
  const UserModel = createFakeUserModel({
    _id: "user-1",
    aiCredits: 1,
    monthlyAiCredits: 1,
    paidAiCredits: 0,
    monthlyAiCreditPeriod: "2026-07",
  });

  const result = await grantMonthlyAiCredits("user-1", {
    UserModel,
    now: new Date("2026-07-20T01:00:00.000Z"),
  });

  assert.equal(result.granted, false);
  assert.equal(result.user.monthlyAiCredits, 1);
  assert.equal(result.user.aiCredits, 1);
});

for (const previousMonthlyBalance of [3, 1, 0]) {
  test(`a new month resets ${previousMonthlyBalance} free credits to 3 without accumulation`, async () => {
    const UserModel = createFakeUserModel({
      _id: "user-1",
      aiCredits: previousMonthlyBalance,
      monthlyAiCredits: previousMonthlyBalance,
      paidAiCredits: 0,
      monthlyAiCreditPeriod: "2026-06",
    });

    const result = await grantMonthlyAiCredits("user-1", {
      UserModel,
      now: new Date("2026-07-03T01:00:00.000Z"),
    });

    assert.equal(result.user.monthlyAiCredits, 3);
    assert.equal(result.user.aiCredits, 3);
  });
}

test("paid credits survive the monthly reset", async () => {
  const UserModel = createFakeUserModel({
    _id: "user-1",
    aiCredits: 13,
    monthlyAiCredits: 3,
    paidAiCredits: 10,
    monthlyAiCreditPeriod: "2026-06",
  });

  const result = await grantMonthlyAiCredits("user-1", {
    UserModel,
    now: new Date("2026-07-03T01:00:00.000Z"),
  });

  assert.deepEqual(getAiCreditBalance(result.user), {
    monthlyAiCredits: 3,
    paidAiCredits: 10,
    balance: 13,
  });
});

test("legacy aiCredits are preserved as paid credits", async () => {
  const UserModel = createFakeUserModel({
    _id: "user-1",
    aiCredits: 10,
    monthlyAiCreditPeriod: "2026-07",
  });

  const result = await grantMonthlyAiCredits("user-1", {
    UserModel,
    now: new Date("2026-07-03T01:00:00.000Z"),
  });

  assert.deepEqual(getAiCreditBalance(result.user), {
    monthlyAiCredits: 3,
    paidAiCredits: 10,
    balance: 13,
  });
});

test("credit usage deducts monthly credits before paid credits", async () => {
  const UserModel = createFakeUserModel({
    _id: "user-1",
    aiCredits: 13,
    monthlyAiCredits: 3,
    paidAiCredits: 10,
    monthlyAiCreditPeriod: "2026-07",
  });

  const result = await deductAiCredits("user-1", 4, {
    UserModel,
    now: new Date("2026-07-03T01:00:00.000Z"),
  });

  assert.deepEqual(getAiCreditBalance(result.user), {
    monthlyAiCredits: 0,
    paidAiCredits: 9,
    balance: 9,
  });
});

test("package or admin credits only increase the paid wallet", async () => {
  const UserModel = createFakeUserModel({
    _id: "user-1",
    aiCredits: 12,
    monthlyAiCredits: 2,
    paidAiCredits: 10,
  });

  const user = await addPaidAiCredits("user-1", 5, { UserModel });

  assert.deepEqual(getAiCreditBalance(user), {
    monthlyAiCredits: 2,
    paidAiCredits: 15,
    balance: 17,
  });
});
