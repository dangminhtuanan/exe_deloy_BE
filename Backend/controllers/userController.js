const User = require("../models/User");
const validator = require("validator");
const bcrypt = require("bcryptjs");
const { parsePagination, buildPagination } = require("../utils/pagination");
const { getNormalizedEmail } = require("./authController");

const USER_ROLES = ["user", "staff", "admin", "shipper"];

function getDuplicateFieldMessage(error) {
  if (error?.code !== 11000 || !error.keyPattern) return null;

  if (error.keyPattern.username) {
    return "Username đã tồn tại trong hệ thống";
  }

  if (error.keyPattern.email) {
    return "Email đã tồn tại trong hệ thống";
  }

  return "Dữ liệu đã tồn tại trong hệ thống";
}

// Lấy danh sách người dùng đang hoạt động (isActive=true, chỉ admin)
exports.getAllUsers = async (req, res) => {
  try {
    const pagination = parsePagination(req, { defaultLimit: 50, maxLimit: 200 });
    const filter = {};

    const [usersRaw, total] = await Promise.all([
      User.find(filter).select("-password -refreshToken").populate("avatar").skip(pagination.skip).limit(pagination.limit),
      User.countDocuments(filter),
    ]);

    const users = usersRaw.map(user => ({
      _id: user._id,
      username: user.username,
      email: user.email,
      phone: user.phone || "",
      address: user.address || "",
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      __v: user.__v,
      isActive: user.isActive,
      avatar: user.avatar,
      aiCredits: user.aiCredits,
      monthlyAiCredits: user.monthlyAiCredits,
      paidAiCredits: user.paidAiCredits,
      monthlyAiCreditPeriod: user.monthlyAiCreditPeriod,
      monthlyAiCreditGrantedAt: user.monthlyAiCreditGrantedAt,
    }));

    res.json({
      message: "Lấy danh sách người dùng thành công",
      users,
      pagination: buildPagination(total, pagination.page, pagination.limit),
    });
  } catch (error) {
    res.status(500).json({ message: "Đã xảy ra lỗi khi lấy danh sách người dùng", error });
  }
};

// Lấy thông tin chi tiết một người dùng theo ID (chỉ admin)
exports.getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-password -refreshToken").populate("avatar");
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
      isActive: user.isActive,
      avatar: user.avatar,
      aiCredits: user.aiCredits,
      monthlyAiCredits: user.monthlyAiCredits,
      paidAiCredits: user.paidAiCredits,
      monthlyAiCreditPeriod: user.monthlyAiCreditPeriod,
      monthlyAiCreditGrantedAt: user.monthlyAiCreditGrantedAt,
    };
    res.json({ message: "Lấy thông tin người dùng thành công", user: userData });
  } catch (error) {
    res.status(500).json({ message: "Đã xảy ra lỗi khi lấy thông tin người dùng", error });
  }
};

// Tạo mới một người dùng (chỉ admin)
exports.createUser = async (req, res) => {
  try {
    const { username, email, password, role, phone, address } = req.body;
    if (!username || !email || !password || !role) {
      return res.status(400).json({ message: "Vui lòng nhập đầy đủ thông tin" });
    }
    const normalizedUsername = username.trim();
    if (!normalizedUsername) {
      return res.status(400).json({ message: "Username không hợp lệ" });
    }
    const normalizedEmail = getNormalizedEmail(email);
    if (!validator.isEmail(normalizedEmail)) {
      return res.status(400).json({ message: "Email không hợp lệ" });
    }
    if (!USER_ROLES.includes(role)) {
      return res.status(400).json({ message: "Role không hợp lệ" });
    }
    if (phone && (!validator.isMobilePhone(phone, 'vi-VN') || phone.length < 9 || phone.length > 12)) {
      return res.status(400).json({ message: "Số điện thoại không hợp lệ" });
    }
    if (address !== undefined && address !== null && address !== "" && address.trim().length === 0) {
      return res.status(400).json({ message: "Địa chỉ không hợp lệ" });
    }
    const existingByEmail = await User.findOne({ email: normalizedEmail });
    if (existingByEmail) {
      return res.status(400).json({ message: "Email đã tồn tại trong hệ thống" });
    }
    const existingByUsername = await User.findOne({ username: normalizedUsername });
    if (existingByUsername) {
      return res.status(400).json({ message: "Username đã tồn tại trong hệ thống" });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({
      username: normalizedUsername,
      email: normalizedEmail,
      password: hashedPassword,
      role,
      phone: phone || "",
      address: address || ""
    });
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
      isActive: user.isActive,
      avatar: user.avatar,
      aiCredits: user.aiCredits,
      monthlyAiCredits: user.monthlyAiCredits,
      paidAiCredits: user.paidAiCredits,
      monthlyAiCreditPeriod: user.monthlyAiCreditPeriod,
      monthlyAiCreditGrantedAt: user.monthlyAiCreditGrantedAt,
    };
    res.status(201).json({ message: "Tạo người dùng mới thành công", user: userData });
  } catch (error) {
    const duplicateFieldMessage = getDuplicateFieldMessage(error);
    if (duplicateFieldMessage) {
      return res.status(400).json({ message: duplicateFieldMessage });
    }
    console.error("Lỗi createUser:", error);
    res.status(500).json({ message: "Đã xảy ra lỗi khi tạo người dùng mới", error });
  }
};

// Cập nhật thông tin người dùng (chỉ admin)
exports.updateUser = async (req, res) => {
  try {
    const { username, email, role, phone, address, isActive } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "Không tìm thấy người dùng" });
    }
    if (email) {
      const normalizedEmail = getNormalizedEmail(email);
      if (!validator.isEmail(normalizedEmail)) {
        return res.status(400).json({ message: "Email không hợp lệ" });
      }
      const emailExists = await User.findOne({ email: normalizedEmail, _id: { $ne: user._id } });
      if (emailExists) {
        return res.status(400).json({ message: "Email đã tồn tại trong hệ thống" });
      }
      user.email = normalizedEmail;
    }
    if (username !== undefined) {
      const normalizedUsername = username.trim();
      if (!normalizedUsername) {
        return res.status(400).json({ message: "Username không hợp lệ" });
      }
      const usernameExists = await User.findOne({ username: normalizedUsername, _id: { $ne: user._id } });
      if (usernameExists) {
        return res.status(400).json({ message: "Username đã tồn tại trong hệ thống" });
      }
      user.username = normalizedUsername;
    }
    if (role) {
      if (!USER_ROLES.includes(role)) {
        return res.status(400).json({ message: "Role không hợp lệ" });
      }
      user.role = role;
    }
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
    if (isActive !== undefined) {
      if (typeof isActive !== "boolean") {
        return res.status(400).json({ message: "Trạng thái tài khoản không hợp lệ" });
      }
      user.isActive = isActive;
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
      isActive: user.isActive,
      avatar: user.avatar,
      aiCredits: user.aiCredits,
      monthlyAiCredits: user.monthlyAiCredits,
      paidAiCredits: user.paidAiCredits,
      monthlyAiCreditPeriod: user.monthlyAiCreditPeriod,
      monthlyAiCreditGrantedAt: user.monthlyAiCreditGrantedAt,
    };
    res.json({ message: "Cập nhật người dùng thành công", user: userData });
  } catch (error) {
    const duplicateFieldMessage = getDuplicateFieldMessage(error);
    if (duplicateFieldMessage) {
      return res.status(400).json({ message: duplicateFieldMessage });
    }
    console.error("Lỗi updateUser:", error);
    res.status(500).json({ message: "Đã xảy ra lỗi khi cập nhật người dùng", error });
  }
};

// Vô hiệu hóa người dùng (chỉ admin)
exports.deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "Không tìm thấy người dùng" });
    }
    user.isActive = false;
    await user.save();
    const userData = user.toObject();
    delete userData.password;
    delete userData.refreshToken;
    res.json({ message: "Đã khóa tài khoản người dùng", user: userData });
  } catch (error) {
    res.status(500).json({ message: "Đã xảy ra lỗi khi cập nhật trạng thái người dùng", error });
  }
};
