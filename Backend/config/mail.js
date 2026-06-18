const nodemailer = require('nodemailer'); 

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 465,
  secure: process.env.SMTP_SECURE === 'true', 
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

async function sendEmail({ to, subject, text, html }) {
  try {
    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || `"No-Reply" <${process.env.SMTP_USER}>`,
      to,
      subject,
      text,
      html,
    });
    return info;
  } catch (err) {
    console.error("Lỗi khi gửi mail:", err);
    throw err;
  }
}

module.exports = { transporter, sendEmail };
