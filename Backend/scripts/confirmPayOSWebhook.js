const path = require("path");
const dotenv = require("dotenv");
const { getPayOSClient } = require("../config/payos");

dotenv.config({ path: path.join(__dirname, "..", ".env"), quiet: true });

async function main() {
  const backendUrl = String(process.env.BACKEND_URL || "").replace(/\/$/, "");
  if (!/^https:\/\//i.test(backendUrl)) {
    throw new Error("BACKEND_URL must be the deployed HTTPS backend URL");
  }

  const webhookUrl = `${backendUrl}/api/payos/webhook`;
  const payOS = getPayOSClient();
  const result = await payOS.webhooks.confirm(webhookUrl);
  console.log(`payOS webhook confirmed: ${result.webhookUrl}`);
}

main().catch((error) => {
  console.error(`Cannot confirm payOS webhook: ${error.message}`);
  process.exitCode = 1;
});
