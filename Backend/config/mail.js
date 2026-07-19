const BREVO_EMAIL_ENDPOINT = "https://api.brevo.com/v3/smtp/email";

function getBrevoConfig() {
  const apiKey = process.env.BREVO_API_KEY?.trim();
  const senderEmail = process.env.BREVO_SENDER_EMAIL?.trim();
  const senderName = process.env.BREVO_SENDER_NAME?.trim() || "No-Reply";

  if (!apiKey) {
    throw new Error("Thiếu biến môi trường BREVO_API_KEY");
  }

  if (!senderEmail) {
    throw new Error("Thiếu biến môi trường BREVO_SENDER_EMAIL");
  }

  return { apiKey, senderEmail, senderName };
}

function normalizeRecipients(to) {
  const recipients = Array.isArray(to) ? to : [to];

  return recipients.filter(Boolean).map((recipient) =>
    typeof recipient === "string" ? { email: recipient } : recipient
  );
}

async function sendEmail({ to, subject, text, html }) {
  const { apiKey, senderEmail, senderName } = getBrevoConfig();
  const recipients = normalizeRecipients(to);

  if (recipients.length === 0) {
    throw new Error("Email người nhận không hợp lệ");
  }

  const payload = {
    sender: { email: senderEmail, name: senderName },
    to: recipients,
    subject,
  };

  if (html) {
    payload.htmlContent = html;
  } else if (text) {
    payload.textContent = text;
  } else {
    throw new Error("Email phải có nội dung text hoặc HTML");
  }

  try {
    const response = await fetch(BREVO_EMAIL_ENDPOINT, {
      method: "POST",
      headers: {
        accept: "application/json",
        "api-key": apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const responseBody = await response.json().catch(() => ({}));

    if (!response.ok) {
      const detail = responseBody.message || `HTTP ${response.status}`;
      throw new Error(`Brevo từ chối gửi email: ${detail}`);
    }

    return responseBody;
  } catch (error) {
    console.error("Lỗi khi gửi email qua Brevo:", error.message);
    throw error;
  }
}

module.exports = { sendEmail };
