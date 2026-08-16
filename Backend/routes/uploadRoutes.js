const express = require("express");
const multer = require("multer");
const { uploadImage, getMyImages, updateMyImage, deleteMyImage } = require("../controllers/uploadController");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      cb(new Error("Only image files are allowed"));
      return;
    }

    cb(null, true);
  },
});

/**
 * @swagger
 * /upload:
 *   post:
 *     summary: Upload image to Cloudinary
 *     tags: [Upload]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Upload successfully
 *       400:
 *         description: Missing image file or invalid file
 *       500:
 *         description: Cloudinary or server error
 */
router.get("/library", authMiddleware, getMyImages);
router.patch("/library/:id", authMiddleware, updateMyImage);
router.delete("/library/:id", authMiddleware, deleteMyImage);

router.post("/", authMiddleware, (req, res, next) => {
  upload.single("image")(req, res, (error) => {
    if (error) {
      return res.status(400).json({ message: error.message });
    }

    return uploadImage(req, res, next);
  });
});

module.exports = router;
