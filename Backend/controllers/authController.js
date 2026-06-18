const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const validator = require("validator");
const { sendEmail } = require("../config/mail");
const pendingRegister = {};


// Hàm tạo mã OTP ngẫu nhiên
function generateOTP(len = 6) {
  let otp = "";
  for (let i = 0; i < len; i++) otp += Math.floor(Math.random() * 10);
  return otp;
}

// Hàm chuẩn hóa email (lowercase, trim)
function getNormalizedEmail(email) {
  return email && typeof email === 'string' ? email.trim().toLowerCase() : email;
}

// Gửi OTP để đăng ký tài khoản
const sendRegisterOtp = async (req, res) => {
  try {
    const { username, email, password, phone, address } = req.body;
      if (!username || !email || !password) {
        return res.status(400).json({ message: "Vui lòng nhập đầy đủ thông tin" });
      }
      if (phone && (!validator.isMobilePhone(phone, 'vi-VN') || phone.length < 9 || phone.length > 12)) {
        return res.status(400).json({ message: "Số điện thoại không hợp lệ" })
      }
      if (address !== undefined && address !== null && address !== "" && address.trim().length === 0) {
        return res.status(400).json({ message: "Địa chỉ không hợp lệ" });
      }
    const normalizedEmail = getNormalizedEmail(email);
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({ message: "Email đã được sử dụng" });
    }
    const otp = generateOTP(6);
    const otpHash = crypto.createHash("sha256").update(otp).digest("hex");
    const expiresAt = Date.now() + 10 * 60 * 1000;
    pendingRegister[normalizedEmail] = { username, email: normalizedEmail, password, phone, address, otpHash, expiresAt };
    await sendEmail({
      to: normalizedEmail,
      subject: "Mã OTP đăng ký tài khoản",
      text: `OTP đăng ký của bạn: ${otp} (hết hạn trong 10 phút)`
    });
    res.json({ message: "Nếu email tồn tại, OTP đã được gửi" });
  } catch (error) {
    console.error("Lỗi sendRegisterOtp:", error);
    res.status(500).json({ message: "Đã xảy ra lỗi khi gửi OTP đăng ký", error: error.message });
  }
};

// Xác thực OTP đăng ký và hoàn tất đăng ký
const verifyRegisterOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ message: "Vui lòng nhập đầy đủ thông tin" });
    }
    const normalizedEmail = getNormalizedEmail(email);
    const record = pendingRegister[normalizedEmail];
    if (!record || Date.now() > record.expiresAt) {
      return res.status(400).json({ message: "Mã OTP không hợp lệ hoặc đã hết hạn" });
    }
    const otpHash = crypto.createHash("sha256").update(otp).digest("hex");
    if (otpHash !== record.otpHash) {
      return res.status(400).json({ message: "Mã OTP không đúng" });
    }
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({ message: "Email đã được sử dụng" });
    }
    const hashedPassword = await bcrypt.hash(record.password, 10);
    const newUser = new User({
      username: record.username,
      email: normalizedEmail,
      password: hashedPassword,
      phone: record.phone || "",
      address: record.address || ""
    });
    await newUser.save();
    delete pendingRegister[normalizedEmail];
    res.status(201).json({ message: "Đăng ký tài khoản thành công" });
  } catch (error) {
    console.error("Lỗi verifyRegisterOtp:", error);
    res.status(500).json({ message: "Đã xảy ra lỗi khi xác thực OTP đăng ký", error: error.message });
  }
};

// Đăng nhập
const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = getNormalizedEmail(email);
    const user = await User.findOne({ email: normalizedEmail });
    if (!user || user.isActive === false) {
      return res.status(400).json({ message: "Tài khoản không tồn tại hoặc đã bị vô hiệu hóa" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Email hoặc mật khẩu không đúng" });
    }

    const accessToken = jwt.sign(
      {
        id: user._id,
        email: user.email,
        username: user.username,
        role: user.role,
        phone: user.phone || "",
        address: user.address || ""
      },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );
    const refreshToken = jwt.sign(
      {
        id: user._id,
        email: user.email,
        username: user.username,
        role: user.role,
        phone: user.phone || "",
        address: user.address || ""
      },
      process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );
    user.refreshToken = refreshToken;
    await user.save();
      const { password: _, refreshToken: __, ...userDataRaw } = user.toObject();
      // Sắp xếp lại thứ tự: _id, username, email, phone, address, role, ...
      const userData = {
        _id: userDataRaw._id,
        username: userDataRaw.username,
        email: userDataRaw.email,
        phone: userDataRaw.phone || "",
        address: userDataRaw.address || "",
        role: userDataRaw.role,
        createdAt: userDataRaw.createdAt,
        updatedAt: userDataRaw.updatedAt,
        __v: userDataRaw.__v,
        isActive: userDataRaw.isActive
      };
      res.json({ message: "Đăng nhập thành công", profile: userData, accessToken, refreshToken });
  } catch (error) {
    console.error("Lỗi login:", error);
    res.status(500).json({ message: "Đã xảy ra lỗi khi đăng nhập", error: error.message });
  }
};

//  Sử dụng refresh token làm mới access token
const refreshTokenController = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(401).json({ message: "Vui lòng cung cấp refresh token" });
    let payload;
    try {
      payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET);
    } catch (err) {
      return res.status(403).json({ message: "Refresh token không hợp lệ hoặc đã hết hạn" });
    }
    const user = await User.findOne({ _id: payload.id, refreshToken });
    if (!user) {
      return res.status(403).json({ message: "Refresh token không hợp lệ" });
    }
    const newAccessToken = jwt.sign(
      { id: user._id, email: user.email, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );
    res.json({ message: "Làm mới access token thành công", accessToken: newAccessToken });
  } catch (error) {
    console.error("Lỗi refreshTokenController:", error);
    res.status(500).json({ message: "Đã xảy ra lỗi khi làm mới access token", error: error.message });
  }
};

const otpStore = {};

// Yêu cầu gửi OTP đặt lại mật khẩu
const requestReset = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Vui lòng nhập email" });

    const normalizedEmail = getNormalizedEmail(email);
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(200).json({ message: "Nếu email tồn tại, OTP đã được gửi" });
    }

    const otp = generateOTP(6);
    const otpHash = crypto.createHash("sha256").update(otp).digest("hex");
    const expiresAt = Date.now() + 10 * 60 * 1000;

    otpStore[normalizedEmail] = { otpHash, expiresAt };

    await sendEmail({
      to: normalizedEmail,
      subject: "Mã OTP reset mật khẩu",
      text: `OTP của bạn: ${otp} (hết hạn trong 10 phút)`,
    });

    res.json({ message: "Nếu email tồn tại, OTP đã được gửi" });
  } catch (error) {
    console.error("Lỗi requestReset:", error);
    res.status(500).json({ message: "Đã xảy ra lỗi khi gửi OTP đặt lại mật khẩu", error: error.message });
  }
};

// Xác thực OTP đặt lại mật khẩu và đổi mật khẩu mới
const verifyOtp = async (req, res) => {
  try {
    const { email, otp, newPassword, confirmPassword } = req.body;
    if (!email || !otp || !newPassword || !confirmPassword) {
      return res.status(400).json({ message: "Vui lòng nhập đầy đủ thông tin" });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: "Mật khẩu xác nhận không khớp" });
    }
    const normalizedEmail = getNormalizedEmail(email);
    const record = otpStore[normalizedEmail];
    if (!record || Date.now() > record.expiresAt) {
      return res.status(400).json({ message: "Mã OTP không hợp lệ hoặc đã hết hạn" });
    }
    const otpHash = crypto.createHash("sha256").update(otp).digest("hex");
    if (otpHash !== record.otpHash) {
      return res.status(400).json({ message: "Mã OTP không đúng" });
    }
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(400).json({ message: "Người dùng không tồn tại" });
    }
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();
    delete otpStore[normalizedEmail];
    res.json({ message: "Đặt lại mật khẩu thành công" });
  } catch (error) {
    console.error("Lỗi verifyOtp:", error);
    res.status(500).json({ message: "Đã xảy ra lỗi khi xác thực OTP đặt lại mật khẩu", error: error.message });
  }
};

module.exports = {
  login,
  requestReset,
  verifyOtp,
  sendRegisterOtp,
  verifyRegisterOtp,
  refreshTokenController,
  generateOTP,
  getNormalizedEmail
};
