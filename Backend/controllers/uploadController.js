const cloudinary = require("../config/cloudinary");

const hasCloudinaryConfig = () =>
  Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
  );

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
      (error, result) => {
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

        return res.status(200).json({
          message: "Upload successfully",
          url: result.secure_url,
          public_id: result.public_id,
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

module.exports = {
  uploadImage,
};
