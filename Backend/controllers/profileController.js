// Lấy thông tin avatar hiện tại của user
exports.getAvatar = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId).populate('avatar');
    if (!user || !user.avatar) {
      return res.status(404).json({ message: "Chưa có avatar" });
    }
    const avatar = user.avatar;
    res.json({
      message: "Lấy avatar thành công",
      avatar: {
        _id: avatar._id,
        url: avatar.path,
        filename: avatar.filename,
        mimetype: avatar.mimetype,
        size: avatar.size,
        uploadedAt: avatar.uploadedAt
      }
    });
  } catch (error) {
    res.status(500).json({ message: "Đã xảy ra lỗi khi lấy avatar", error });
  }
};
const User = require("../models/User");
const Avatar = require("../models/Avatar");
const validator = require("validator");
const crypto = require("crypto");
const { sendEmail } = require("../config/mail");
const { generateOTP, getNormalizedEmail } = require("./authController");

const otpStoreChangeEmail = {};

// Lấy thông tin cá nhân
exports.getProfile = async (req, res) => {
  try {
    const userId = req.user.id;
  const user = await User.findById(userId).select("-password").populate("avatar");
    if (!user) {
      return res.status(404).json({ message: "Không tìm thấy người dùng" });
    }
    const userData = {
      _id: user._id,
      username: user.username,
      email: user.email,
      phone: user.phone || "",
      address: user.address || "",
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      __v: user.__v,
      refreshToken: user.refreshToken,
      isActive: user.isActive,
      avatar: user.avatar ? {
        _id: user.avatar._id,
        url: user.avatar.path,
        filename: user.avatar.filename,
        mimetype: user.avatar.mimetype,
        size: user.avatar.size,
        uploadedAt: user.avatar.uploadedAt
      } : null
    };
    res.json({ message: "Lấy thông tin cá nhân thành công", profile: userData });
  } catch (error) {
    res.status(500).json({ message: "Đã xảy ra lỗi khi lấy thông tin cá nhân", error });
  }
};

// Cập nhật thông tin cá nhân
exports.updateProfile = async (req, res) => {
  try {
    const userId = req.user.id; 
  const { username, phone, address } = req.body;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "Không tìm thấy người dùng" });
    }
    if (username) user.username = username;
    if (phone !== undefined) {
      if (phone && (!validator.isMobilePhone(phone, 'vi-VN') || phone.length < 9 || phone.length > 12)) {
        return res.status(400).json({ message: "Số điện thoại không hợp lệ" });
      }
      user.phone = phone;
    }
    if (address !== undefined) {
      if (address !== null && address !== undefined && address !== "" && address.trim().length === 0) {
        return res.status(400).json({ message: "Địa chỉ không hợp lệ" });
      }
      user.address = address;
    }
    await user.save();
    const userData = {
      _id: user._id,
      username: user.username,
      email: user.email,
      phone: user.phone || "",
      address: user.address || "",
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      __v: user.__v,
      refreshToken: user.refreshToken,
      isActive: user.isActive
    };
    res.json({ message: "Cập nhật thông tin cá nhân thành công", profile: userData });
  } catch (error) {
    res.status(500).json({ message: "Đã xảy ra lỗi khi cập nhật thông tin cá nhân", error });
  }
};

// Gửi OTP đến email hiện tại để xác thực đổi email
exports.requestChangeEmailOtp = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "Không tìm thấy người dùng" });
    }
    if (!user.isActive) {
      return res.status(403).json({ message: "Tài khoản đã bị vô hiệu hóa" });
    }
  const otp = generateOTP(6);
    const otpHash = crypto.createHash("sha256").update(otp).digest("hex");
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 phút
    otpStoreChangeEmail[userId] = { otpHash, expiresAt };
    await sendEmail({
      to: user.email,
      subject: "Mã OTP xác thực đổi email",
      text: `Mã OTP xác thực đổi email của bạn là: ${otp} (hết hạn sau 10 phút)`
    });
    res.json({ message: "Nếu email tồn tại, OTP đã được gửi" });
  } catch (error) {
    res.status(500).json({ message: "Đã xảy ra lỗi khi gửi OTP xác thực đổi email", error });
  }
};

// Xác thực OTP email hiện tại
exports.verifyCurrentEmailOtp = async (req, res) => {
  try {
    const userId = req.user.id;
    const { otp } = req.body;
    if (!otp) {
      return res.status(400).json({ message: "Vui lòng nhập mã OTP" });
    }
    const record = otpStoreChangeEmail[userId];
    if (!record || Date.now() > record.expiresAt) {
      return res.status(400).json({ message: "Mã OTP không hợp lệ hoặc đã hết hạn" });
    }
    const otpHash = crypto.createHash("sha256").update(otp).digest("hex");
    if (otpHash !== record.otpHash) {
      return res.status(400).json({ message: "Mã OTP không đúng" });
    }
    otpStoreChangeEmail[userId].verifiedCurrent = true;
    res.json({ message: "Xác thực OTP email hiện tại thành công" });
  } catch (error) {
    res.status(500).json({ message: "Đã xảy ra lỗi khi xác thực OTP email hiện tại", error });
  }
};

// Gửi OTP tới email mới (sau khi đã xác thực email cũ)
exports.requestNewEmailOtp = async (req, res) => {
  try {
    const userId = req.user.id;
    const { newEmail } = req.body;
    if (!newEmail) {
      return res.status(400).json({ message: "Email mới không hợp lệ" });
    }
    const normalizedEmail = getNormalizedEmail(newEmail);
    if (!validator.isEmail(normalizedEmail)) {
      return res.status(400).json({ message: "Email mới không hợp lệ" });
    }
    const record = otpStoreChangeEmail[userId];
    if (!record || !record.verifiedCurrent) {
      return res.status(400).json({ message: "Bạn cần xác thực OTP email hiện tại trước" });
    }
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "Không tìm thấy người dùng" });
    }
    if (user.email === normalizedEmail) {
      return res.status(400).json({ message: "Email mới không được trùng email hiện tại" });
    }
    const existed = await User.findOne({ email: normalizedEmail });
    if (existed) {
      return res.status(400).json({ message: "Email mới đã được sử dụng" });
    }
    const otp = generateOTP(6);
    const otpHash = crypto.createHash("sha256").update(otp).digest("hex");
    const expiresAt = Date.now() + 10 * 60 * 1000;
    otpStoreChangeEmail[userId].newEmail = normalizedEmail;
    otpStoreChangeEmail[userId].otpNewHash = otpHash;
    otpStoreChangeEmail[userId].otpNewExpiresAt = expiresAt;
    await sendEmail({
      to: normalizedEmail,
      subject: "Mã OTP xác thực email mới",
      text: `Mã OTP xác thực email mới của bạn là: ${otp} (hết hạn sau 10 phút)`
    });
    res.json({ message: "Nếu email hợp lệ, OTP đã được gửi tới email mới" });
  } catch (error) {
    res.status(500).json({ message: "Đã xảy ra lỗi khi gửi OTP tới email mới", error });
  }
};

// Xác thực OTP email mới và đổi email
exports.changeEmail = async (req, res) => {
  try {
    const userId = req.user.id;
    const { otp } = req.body;
    if (!otp) {
      return res.status(400).json({ message: "Vui lòng nhập mã OTP" });
    }
    const record = otpStoreChangeEmail[userId];
    if (!record || !record.verifiedCurrent || !record.otpNewHash || !record.otpNewExpiresAt || !record.newEmail) {
      return res.status(400).json({ message: "Bạn cần thực hiện đúng các bước xác thực trước" });
    }
    if (Date.now() > record.otpNewExpiresAt) {
      return res.status(400).json({ message: "Mã OTP email mới đã hết hạn" });
    }
    const otpHash = crypto.createHash("sha256").update(otp).digest("hex");
    if (otpHash !== record.otpNewHash) {
      return res.status(400).json({ message: "Mã OTP không đúng" });
    }
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "Không tìm thấy người dùng" });
    }
    user.email = record.newEmail;
    await user.save();
    delete otpStoreChangeEmail[userId];
    res.json({ message: "Đổi email thành công" });
  } catch (error) {
    res.status(500).json({ message: "Đã xảy ra lỗi khi xác thực OTP email mới và đổi email", error });
  }
};

// Store OTP đổi mật khẩu (theo userId)
const otpStoreChangePassword = {};

// Gửi OTP về email để xác thực đổi mật khẩu
exports.requestChangePasswordOtp = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);
    if (!user || !user.isActive) {
      // Không tiết lộ user tồn tại hay không, luôn trả về thành công
      return res.json({ message: "Nếu email tồn tại, OTP đã được gửi" });
    }
    const otp = generateOTP(6);
    const otpHash = crypto.createHash("sha256").update(otp).digest("hex");
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 phút
    otpStoreChangePassword[userId] = { otpHash, expiresAt };
    await sendEmail({
      to: user.email,
      subject: "Mã OTP đổi mật khẩu",
      text: `Mã OTP đổi mật khẩu của bạn là: ${otp} (hết hạn sau 10 phút)`
    });
    res.json({ message: "Nếu email tồn tại, OTP đã được gửi" });
  } catch (error) {
    res.status(500).json({ message: "Đã xảy ra lỗi khi gửi OTP đổi mật khẩu", error });
  }
}; 

// Xác thực OTP và đổi mật khẩu
exports.changePassword = async (req, res) => {
  try {
    const userId = req.user.id;
    const { otp, newPassword, confirmPassword } = req.body;
    if (!otp || !newPassword || !confirmPassword) {
      return res.status(400).json({ message: "Vui lòng nhập đầy đủ thông tin" });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: "Mật khẩu xác nhận không khớp" });
    }
    const record = otpStoreChangePassword[userId];
    if (!record || Date.now() > record.expiresAt) {
      return res.status(400).json({ message: "Mã OTP không hợp lệ hoặc đã hết hạn" });
    }
    const otpHash = crypto.createHash("sha256").update(otp).digest("hex");
    if (otpHash !== record.otpHash) {
      return res.status(400).json({ message: "Mã OTP không đúng" });
    }
    const user = await User.findById(userId);
    if (!user) {
      return res.status(400).json({ message: "Người dùng không tồn tại" });
    }
    user.password = await require("bcryptjs").hash(newPassword, 10);
    await user.save();
    delete otpStoreChangePassword[userId];
    res.json({ message: "Đổi mật khẩu thành công" });
  } catch (error) {
    res.status(500).json({ message: "Đã xảy ra lỗi khi đổi mật khẩu", error });
  }
};

// Upload avatar
exports.uploadAvatar = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Vui lòng chọn file ảnh để upload" });
    }
    const userId = req.user.id;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "Không tìm thấy người dùng" });
    }
    if (user.avatar) {
      const oldAvatar = await Avatar.findById(user.avatar);
      if (oldAvatar) {
        await oldAvatar.deleteOne();
      }
    }
    const avatarDoc = await Avatar.create({
      user: user._id,
      filename: req.file.filename,
      path: `/image/${req.file.filename}`,
      mimetype: req.file.mimetype,
      size: req.file.size
    });
    user.avatar = avatarDoc._id;
    await user.save();
    res.json({
      message: "Upload avatar thành công",
      avatar: {
        _id: avatarDoc._id,
        url: avatarDoc.path,
        filename: avatarDoc.filename,
        mimetype: avatarDoc.mimetype,
        size: avatarDoc.size,
        uploadedAt: avatarDoc.uploadedAt
      }
    });
  } catch (error) {
    res.status(500).json({ message: "Đã xảy ra lỗi khi upload avatar", error });
  }
};