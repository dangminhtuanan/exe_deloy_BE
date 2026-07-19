const { BetaAnalyticsDataClient } = require("@google-analytics/data");

function numberValue(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function createAnalyticsClient() {
  const clientEmail = process.env.GA4_CLIENT_EMAIL?.trim();
  const privateKey = process.env.GA4_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (clientEmail && privateKey) {
    return new BetaAnalyticsDataClient({
      credentials: {
        client_email: clientEmail,
        private_key: privateKey,
      },
    });
  }

  // Also supports GOOGLE_APPLICATION_CREDENTIALS when deployed with a JSON file.
  return new BetaAnalyticsDataClient();
}

exports.getVisitorReport = async (req, res) => {
  const propertyId = process.env.GA4_PROPERTY_ID?.trim();
  const hasInlineCredentials = Boolean(
    process.env.GA4_CLIENT_EMAIL?.trim() && process.env.GA4_PRIVATE_KEY?.trim(),
  );
  const hasCredentialFile = Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim());

  if (!propertyId || (!hasInlineCredentials && !hasCredentialFile)) {
    return res.status(503).json({
      message: "Google Analytics Data API is not configured",
      code: "GA4_NOT_CONFIGURED",
      required: ["GA4_PROPERTY_ID", "GA4_CLIENT_EMAIL", "GA4_PRIVATE_KEY"],
    });
  }

  try {
    const analyticsDataClient = createAnalyticsClient();
    const property = `properties/${propertyId}`;

    const [[realtime], [today], [topPages]] = await Promise.all([
      analyticsDataClient.runRealtimeReport({
        property,
        metrics: [{ name: "activeUsers" }],
      }),
      analyticsDataClient.runReport({
        property,
        dateRanges: [{ startDate: "today", endDate: "today" }],
        metrics: [
          { name: "activeUsers" },
          { name: "newUsers" },
          { name: "sessions" },
          { name: "screenPageViews" },
        ],
      }),
      analyticsDataClient.runReport({
        property,
        dateRanges: [{ startDate: "7daysAgo", endDate: "today" }],
        dimensions: [{ name: "pagePath" }, { name: "pageTitle" }],
        metrics: [{ name: "screenPageViews" }, { name: "activeUsers" }],
        orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
        limit: 10,
      }),
    ]);

    const todayMetrics = today.rows?.[0]?.metricValues || [];
    const activeNow = numberValue(realtime.rows?.[0]?.metricValues?.[0]?.value);

    return res.json({
      message: "Get Google Analytics visitor report successfully",
      propertyId,
      generatedAt: new Date().toISOString(),
      realtime: {
        activeUsers: activeNow,
      },
      today: {
        activeUsers: numberValue(todayMetrics[0]?.value),
        newUsers: numberValue(todayMetrics[1]?.value),
        sessions: numberValue(todayMetrics[2]?.value),
        pageViews: numberValue(todayMetrics[3]?.value),
      },
      topPages: (topPages.rows || []).map((row) => ({
        path: row.dimensionValues?.[0]?.value || "/",
        title: row.dimensionValues?.[1]?.value || "Không có tiêu đề",
        pageViews: numberValue(row.metricValues?.[0]?.value),
        activeUsers: numberValue(row.metricValues?.[1]?.value),
      })),
    });
  } catch (error) {
    const statusCode = Number(error?.code) === 7 ? 403 : 502;
    return res.status(statusCode).json({
      message: statusCode === 403
        ? "Service Account không có quyền xem GA4 Property này"
        : "Không thể lấy dữ liệu từ Google Analytics",
      code: "GA4_API_ERROR",
      error: error.message,
    });
  }
};

