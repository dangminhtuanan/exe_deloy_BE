const multer = require("multer");
const path = require("path");

const uploadDir = path.join(__dirname, "../image");

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const uniqueName = `${req.user.id}_${Date.now()}${ext}`;
    cb(null, uniqueName);
  },
});

function fileFilter(req, file, cb) {
  if (!file.mimetype.startsWith("image/")) {
    return cb(new Error("Chỉ cho phép upload file ảnh!"), false);
  }
  cb(null, true);
}

const multerMiddleware = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

module.exports = multerMiddleware;
