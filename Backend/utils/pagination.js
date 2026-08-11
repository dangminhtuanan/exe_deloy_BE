function parsePagination(req, { defaultLimit = 20, maxLimit = 100 } = {}) {
  const hasPage = typeof req.query.page !== "undefined";
  const hasLimit = typeof req.query.limit !== "undefined";
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || defaultLimit, 1), maxLimit);
  const skip = (page - 1) * limit;

  return {
    enabled: hasPage || hasLimit,
    page,
    limit,
    skip,
  };
}

function buildPagination(total, page, limit) {
  return {
    page,
    limit,
    total,
    totalPages: Math.max(Math.ceil(total / limit), 1),
  };
}

module.exports = {
  parsePagination,
  buildPagination,
};