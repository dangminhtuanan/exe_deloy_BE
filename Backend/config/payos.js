const { PayOS } = require("@payos/node");

function getPayOSClient() {
  const { PAYOS_CLIENT_ID, PAYOS_API_KEY, PAYOS_CHECKSUM_KEY } = process.env;

  if (!PAYOS_CLIENT_ID || !PAYOS_API_KEY || !PAYOS_CHECKSUM_KEY) {
    throw new Error("Missing payOS environment variables");
  }

  return new PayOS({
    clientId: PAYOS_CLIENT_ID,
    apiKey: PAYOS_API_KEY,
    checksumKey: PAYOS_CHECKSUM_KEY,
  });
}

module.exports = { getPayOSClient };