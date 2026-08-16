const cloudinary = require("../config/cloudinary");
const UserImageAsset = require("../models/UserImageAsset");

const hasCloudinaryConfig = () =>
  Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
  );

const serializeAsset = (asset) => ({
  id: String(asset._id), kind: asset.kind, url: asset.url, name: asset.name,
  clothType: asset.clothType, color: asset.color, gender: asset.gender,
  ageGroup: asset.ageGroup, ethnicity: asset.ethnicity, skinTone: asset.skinTone,
  hairColor: asset.hairColor, tags: asset.tags, createdAt: asset.createdAt,
});

const uploadImage = (req, res) => {
  try {
    if (!hasCloudinaryConfig()) {
      return res.status(500).json({
        message:
          "Missing Cloudinary configuration. Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in Backend/.env",
      });
    }

    if (!req.file) {
      return res.status(400).json({ message: "Please choose an image file" });
    }

    if (!req.file.mimetype?.startsWith("image/")) {
      return res.status(400).json({ message: "Only image files are allowed" });
    }

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: "exe201_fashion_shop",
        resource_type: "image",
      },
      async (error, result) => {
        if (error) {
          console.error("Cloudinary Error:", error);
          return res.status(500).json({
            message: error.message || "Cannot upload image to Cloudinary",
          });
        }

        if (!result?.secure_url) {
          return res.status(500).json({
            message: "Cloudinary did not return an image URL",
          });
        }

        const kind = req.body.kind;
        if (!['model', 'clothing'].includes(kind)) {
          return res.status(400).json({ message: "Image kind must be model or clothing" });
        }
        const asset = await UserImageAsset.create({
          user: req.user.id, kind, url: result.secure_url, publicId: result.public_id,
          name: req.body.name || '', clothType: kind === 'clothing' ? (req.body.clothType || 'upper') : '',
        });
        return res.status(200).json({
          message: "Upload successfully",
          url: result.secure_url,
          public_id: result.public_id,
          asset: serializeAsset(asset),
        });
      }
    );

    uploadStream.end(req.file.buffer);
  } catch (error) {
    console.error("Controller Error:", error);
    return res.status(500).json({
      message: error.message || "Server error while uploading image",
    });
  }
};

const getMyImages = async (req, res) => {
  const assets = await UserImageAsset.find({ user: req.user.id }).sort({ createdAt: -1 });
  res.json({ assets: assets.map(serializeAsset) });
};

const updateMyImage = async (req, res) => {
  const allowed = ['name', 'clothType', 'color', 'gender', 'ageGroup', 'ethnicity', 'skinTone', 'hairColor', 'tags'];
  const updates = Object.fromEntries(allowed.filter((key) => req.body[key] !== undefined).map((key) => [key, req.body[key]]));
  const asset = await UserImageAsset.findOneAndUpdate({ _id: req.params.id, user: req.user.id }, updates, { new: true, runValidators: true });
  if (!asset) return res.status(404).json({ message: 'Image not found' });
  res.json({ asset: serializeAsset(asset) });
};

const deleteMyImage = async (req, res) => {
  const asset = await UserImageAsset.findOneAndDelete({ _id: req.params.id, user: req.user.id });
  if (!asset) return res.status(404).json({ message: 'Image not found' });
  if (asset.publicId) cloudinary.uploader.destroy(asset.publicId).catch((error) => console.error('Cloudinary delete error:', error.message));
  res.json({ message: 'Image deleted' });
};

module.exports = {
  uploadImage,
  getMyImages,
  updateMyImage,
  deleteMyImage,
};
