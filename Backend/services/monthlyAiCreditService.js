const User = require("../models/User");

const MONTHLY_AI_CREDITS = 3;
const VIETNAM_UTC_OFFSET_MS = 7 * 60 * 60 * 1000;

function getMonthlyCreditPeriod(date = new Date()) {
  const vietnamTime = new Date(date.getTime() + VIETNAM_UTC_OFFSET_MS);
  const year = vietnamTime.getUTCFullYear();
  const month = String(vietnamTime.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function getAiCreditBalance(user) {
  const monthlyAiCredits = Math.max(0, Number(user?.monthlyAiCredits) || 0);
  const paidAiCredits = Math.max(0, Number(user?.paidAiCredits) || 0);

  return {
    monthlyAiCredits,
    paidAiCredits,
    balance: monthlyAiCredits + paidAiCredits,
  };
}

function withSession(options, session) {
  return session ? { ...options, session } : options;
}

async function ensureAiCreditBuckets(userId, options = {}) {
  const UserModel = options.UserModel || User;

  // Existing accounts only had aiCredits. Preserve that legacy balance as paid
  // credits before the monthly and paid wallets are used for the first time.
  // Reset the legacy period so the account also receives its first separated
  // monthly allowance; this favors preserving every potentially paid credit.
  return UserModel.findOneAndUpdate(
    {
      _id: userId,
      $or: [
        { monthlyAiCredits: { $exists: false } },
        { paidAiCredits: { $exists: false } },
      ],
    },
    [
      {
        $set: {
          monthlyAiCredits: { $ifNull: ["$monthlyAiCredits", 0] },
          paidAiCredits: {
            $ifNull: [
              "$paidAiCredits",
              {
                $max: [
                  {
                    $subtract: [
                      { $ifNull: ["$aiCredits", 0] },
                      { $ifNull: ["$monthlyAiCredits", 0] },
                    ],
                  },
                  0,
                ],
              },
            ],
          },
          monthlyAiCreditPeriod: null,
          monthlyAiCreditGrantedAt: null,
        },
      },
      {
        $set: {
          aiCredits: { $add: ["$monthlyAiCredits", "$paidAiCredits"] },
        },
      },
    ],
    withSession({ new: true, runValidators: true }, options.session)
  );
}

async function grantMonthlyAiCredits(userId, options = {}) {
  const UserModel = options.UserModel || User;
  const now = options.now || new Date();
  const period = getMonthlyCreditPeriod(now);

  await ensureAiCreditBuckets(userId, options);

  // The period condition and update pipeline make a monthly reset idempotent.
  // Paid credits are preserved while free credits are reset to exactly 3.
  const grantedUser = await UserModel.findOneAndUpdate(
    {
      _id: userId,
      monthlyAiCreditPeriod: { $ne: period },
    },
    [
      {
        $set: {
          monthlyAiCredits: MONTHLY_AI_CREDITS,
          paidAiCredits: { $ifNull: ["$paidAiCredits", 0] },
          monthlyAiCreditPeriod: period,
          monthlyAiCreditGrantedAt: now,
        },
      },
      {
        $set: {
          aiCredits: { $add: ["$monthlyAiCredits", "$paidAiCredits"] },
        },
      },
    ],
    withSession({ new: true, runValidators: true }, options.session)
  );

  if (grantedUser) {
    return {
      user: grantedUser,
      granted: true,
      creditsGranted: MONTHLY_AI_CREDITS,
      period,
    };
  }

  const query = UserModel.findById(userId);
  const user = options.session && query?.session ? await query.session(options.session) : await query;
  return {
    user,
    granted: false,
    creditsGranted: 0,
    period,
  };
}

async function addPaidAiCredits(userId, credits, options = {}) {
  const amount = Number(credits);
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new TypeError("Credits must be a positive integer");
  }

  const UserModel = options.UserModel || User;
  await ensureAiCreditBuckets(userId, options);

  return UserModel.findOneAndUpdate(
    { _id: userId },
    {
      $inc: {
        paidAiCredits: amount,
        aiCredits: amount,
      },
    },
    withSession({ new: true, runValidators: true }, options.session)
  );
}

async function deductAiCredits(userId, credits, options = {}) {
  const amount = Number(credits);
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new TypeError("Credits must be a positive integer");
  }

  const UserModel = options.UserModel || User;
  const monthlyGrant = await grantMonthlyAiCredits(userId, options);
  if (!monthlyGrant.user) {
    return { user: null, currentUser: null, monthlyGrant };
  }

  // Free credits are spent first. The filter and pipeline run as one atomic
  // operation, so parallel requests cannot spend the same balance.
  const user = await UserModel.findOneAndUpdate(
    {
      _id: userId,
      $expr: {
        $gte: [
          {
            $add: [
              { $ifNull: ["$monthlyAiCredits", 0] },
              { $ifNull: ["$paidAiCredits", 0] },
            ],
          },
          amount,
        ],
      },
    },
    [
      {
        $set: {
          monthlyAiCredits: {
            $max: [
              { $subtract: [{ $ifNull: ["$monthlyAiCredits", 0] }, amount] },
              0,
            ],
          },
          paidAiCredits: {
            $subtract: [
              { $ifNull: ["$paidAiCredits", 0] },
              {
                $max: [
                  { $subtract: [amount, { $ifNull: ["$monthlyAiCredits", 0] }] },
                  0,
                ],
              },
            ],
          },
        },
      },
      {
        $set: {
          aiCredits: { $add: ["$monthlyAiCredits", "$paidAiCredits"] },
        },
      },
    ],
    withSession({ new: true, runValidators: true }, options.session)
  );

  if (user) return { user, currentUser: user, monthlyGrant };

  const query = UserModel.findById(userId);
  const currentUser = options.session && query?.session ? await query.session(options.session) : await query;
  return { user: null, currentUser, monthlyGrant };
}

module.exports = {
  MONTHLY_AI_CREDITS,
  addPaidAiCredits,
  deductAiCredits,
  ensureAiCreditBuckets,
  getAiCreditBalance,
  getMonthlyCreditPeriod,
  grantMonthlyAiCredits,
};
