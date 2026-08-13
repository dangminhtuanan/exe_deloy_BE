const IssueReport = require("../models/IssueReport");
const { parsePagination, buildPagination } = require("../utils/pagination");

exports.createIssueReport = async (req, res) => {
  try {
    const subject = String(req.body.subject || "").trim();
    const description = String(req.body.description || "").trim();
    if (subject.length < 3) return res.status(400).json({ message: "Tiêu đề phải có ít nhất 3 ký tự" });
    if (description.length < 10) return res.status(400).json({ message: "Nội dung phải có ít nhất 10 ký tự" });

    const report = await IssueReport.create({ user: req.user.id, subject, description });
    res.status(201).json({ message: "Gửi báo cáo thành công", report });
  } catch (error) {
    res.status(500).json({ message: "Không thể gửi báo cáo", error: error.message });
  }
};

exports.getMyIssueReports = async (req, res) => {
  try {
    const pagination = parsePagination(req, { defaultLimit: 20, maxLimit: 50 });
    const filter = { user: req.user.id };
    const [reports, total] = await Promise.all([
      IssueReport.find(filter).sort({ createdAt: -1 }).skip(pagination.skip).limit(pagination.limit),
      IssueReport.countDocuments(filter),
    ]);
    res.json({ message: "Lấy báo cáo thành công", reports, pagination: buildPagination(total, pagination.page, pagination.limit) });
  } catch (error) {
    res.status(500).json({ message: "Không thể tải báo cáo", error: error.message });
  }
};

exports.getAllIssueReports = async (req, res) => {
  try {
    const pagination = parsePagination(req, { defaultLimit: 30, maxLimit: 100 });
    const filter = req.query.status ? { status: req.query.status } : {};
    const [reports, total] = await Promise.all([
      IssueReport.find(filter).populate("user", "username email phone").sort({ createdAt: -1 }).skip(pagination.skip).limit(pagination.limit),
      IssueReport.countDocuments(filter),
    ]);
    res.json({ message: "Lấy báo cáo thành công", reports, pagination: buildPagination(total, pagination.page, pagination.limit) });
  } catch (error) {
    res.status(500).json({ message: "Không thể tải báo cáo", error: error.message });
  }
};

exports.updateIssueReport = async (req, res) => {
  try {
    const allowedStatuses = ["new", "in_progress", "resolved", "rejected"];
    const status = String(req.body.status || "");
    if (!allowedStatuses.includes(status)) return res.status(400).json({ message: "Trạng thái không hợp lệ" });

    const report = await IssueReport.findByIdAndUpdate(
      req.params.id,
      {
        status,
        adminNote: String(req.body.adminNote || "").trim(),
        resolvedAt: ["resolved", "rejected"].includes(status) ? new Date() : null,
      },
      { new: true, runValidators: true }
    ).populate("user", "username email phone");
    if (!report) return res.status(404).json({ message: "Không tìm thấy báo cáo" });
    res.json({ message: "Cập nhật báo cáo thành công", report });
  } catch (error) {
    res.status(500).json({ message: "Không thể cập nhật báo cáo", error: error.message });
  }
};
