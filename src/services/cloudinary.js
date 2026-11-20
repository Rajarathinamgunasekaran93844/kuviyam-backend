const { randomUUID } = require("node:crypto");
const cloudinary = require("cloudinary").v2;
const ApiError = require("../utils/ApiError");

const cloudinaryFields = [
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
];

const getCloudinaryConfiguration = () => {
  const configured = cloudinaryFields.filter((name) => process.env[name]);

  if (configured.length === 0) return null;
  if (configured.length !== cloudinaryFields.length) {
    throw new ApiError(503, "Cloudinary configuration is incomplete.");
  }

  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });

  return cloudinary;
};

const uploadImageBuffer = async (buffer) => {
  const client = getCloudinaryConfiguration();
  if (!client) throw new ApiError(503, "Cloudinary is not configured.");

  return new Promise((resolve, reject) => {
    const stream = client.uploader.upload_stream(
      {
        folder: "kuviyam/gallery",
        public_id: randomUUID(),
        resource_type: "image",
        overwrite: false,
      },
      (error, result) => {
        if (error) return reject(error);
        if (!result?.secure_url || !result?.public_id) {
          return reject(new Error("Cloudinary returned an incomplete upload result."));
        }
        return resolve({
          url: result.secure_url,
          publicId: result.public_id,
          bytes: result.bytes,
        });
      }
    );

    stream.end(buffer);
  });
};

const deleteCloudinaryImage = async (publicId) => {
  if (!publicId) return;
  const client = getCloudinaryConfiguration();
  if (!client) throw new ApiError(503, "Cloudinary is not configured.");
  const result = await client.uploader.destroy(publicId, { resource_type: "image" });
  if (!result || !["ok", "not found"].includes(result.result)) {
    throw new ApiError(502, "Cloudinary could not delete the gallery image.");
  }
};

module.exports = {
  getCloudinaryConfiguration,
  uploadImageBuffer,
  deleteCloudinaryImage,
};
