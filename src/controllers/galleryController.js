const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { toPositiveInt } = require("../utils/validators");
const {
  createGalleryMedia,
  deleteGalleryMedia,
  getGalleryMedia,
  getGalleryMediaFile,
} = require("../services/store");

const IMAGE_LIMIT = 10 * 1024 * 1024;
const VIDEO_LIMIT = 50 * 1024 * 1024;

const allowedMedia = {
  "image/jpeg": {
    type: "IMAGE",
    signature: (buffer) =>
      buffer.length >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff,
  },
  "image/png": {
    type: "IMAGE",
    signature: (buffer) =>
      buffer.length >= 8 &&
      buffer.subarray(0, 8).equals(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      ),
  },
  "image/gif": {
    type: "IMAGE",
    signature: (buffer) =>
      buffer.length >= 6 && ["GIF87a", "GIF89a"].includes(buffer.toString("ascii", 0, 6)),
  },
  "image/webp": {
    type: "IMAGE",
    signature: (buffer) =>
      buffer.length >= 12 &&
      buffer.toString("ascii", 0, 4) === "RIFF" &&
      buffer.toString("ascii", 8, 12) === "WEBP",
  },
  "video/mp4": {
    type: "VIDEO",
    signature: (buffer) =>
      buffer.length >= 12 && buffer.toString("ascii", 4, 8) === "ftyp",
  },
  "video/webm": {
    type: "VIDEO",
    signature: (buffer) =>
      buffer.length >= 4 &&
      buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])),
  },
};

const cleanText = (value, fallback, maxLength, fieldName) => {
  const text = String(value || fallback).trim();

  if (!text) {
    throw new ApiError(400, `${fieldName} is required.`);
  }

  if (text.length > maxLength) {
    throw new ApiError(400, `${fieldName} must not exceed ${maxLength} characters.`);
  }

  return text;
};

const mediaUrl = (req, id) => {
  const forwardedProtocol = req.get("x-forwarded-proto")?.split(",")[0].trim();
  const protocol = forwardedProtocol || req.protocol;
  return `${protocol}://${req.get("host")}/api/gallery/${id}/file`;
};

const serializeMedia = (req, media) => ({
  id: media.id,
  title: media.title,
  category: media.category,
  mediaType: media.mediaType,
  mimeType: media.mimeType,
  originalName: media.originalName,
  size: media.size,
  createdAt: media.createdAt,
  url: mediaUrl(req, media.id),
});

const listMedia = asyncHandler(async (req, res) => {
  const media = await getGalleryMedia();

  res.json({
    success: true,
    count: media.length,
    media: media.map((item) => serializeMedia(req, item)),
  });
});

const streamMedia = asyncHandler(async (req, res) => {
  const mediaId = toPositiveInt(req.params.id, "Media id");
  const media = await getGalleryMediaFile(mediaId);

  if (!media) {
    throw new ApiError(404, "Gallery media was not found.");
  }

  const encodedName = encodeURIComponent(media.originalName).replace(
    /['()]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  );
  const data = Buffer.from(media.data);
  const rangeHeader = req.get("range");

  if (rangeHeader) {
    const rangeMatch = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
    let start;
    let end;

    if (rangeMatch?.[1]) {
      start = Number(rangeMatch[1]);
      end = rangeMatch[2]
        ? Math.min(Number(rangeMatch[2]), data.length - 1)
        : data.length - 1;
    } else if (rangeMatch?.[2]) {
      const suffixLength = Number(rangeMatch[2]);
      start = Math.max(data.length - suffixLength, 0);
      end = data.length - 1;
    }

    if (
      !rangeMatch ||
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < 0 ||
      start > end ||
      start >= data.length
    ) {
      res.set("Content-Range", `bytes */${data.length}`);
      return res.status(416).end();
    }

    const chunk = data.subarray(start, end + 1);

    res.status(206).set({
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=86400",
      "Content-Disposition": `inline; filename*=UTF-8''${encodedName}`,
      "Content-Length": String(chunk.length),
      "Content-Range": `bytes ${start}-${end}/${data.length}`,
      "Content-Type": media.mimeType,
      "X-Content-Type-Options": "nosniff",
    });
    return res.send(chunk);
  }

  res.set({
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=86400",
    "Content-Disposition": `inline; filename*=UTF-8''${encodedName}`,
    "Content-Length": String(media.size),
    "Content-Type": media.mimeType,
    "X-Content-Type-Options": "nosniff",
  });
  return res.send(data);
});

const uploadMedia = asyncHandler(async (req, res) => {
  const mimeType = String(req.get("content-type") || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  const mediaRule = allowedMedia[mimeType];

  if (!mediaRule) {
    throw new ApiError(
      415,
      "Unsupported media type. Use JPG, PNG, GIF, WebP, MP4, or WebM."
    );
  }

  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    throw new ApiError(400, "Choose a non-empty image or video file to upload.");
  }

  const sizeLimit = mediaRule.type === "IMAGE" ? IMAGE_LIMIT : VIDEO_LIMIT;

  if (req.body.length > sizeLimit) {
    throw new ApiError(
      413,
      `${mediaRule.type === "IMAGE" ? "Images" : "Videos"} must be smaller than ${
        sizeLimit / 1024 / 1024
      } MB.`
    );
  }

  if (!mediaRule.signature(req.body)) {
    throw new ApiError(400, "The uploaded file does not match its declared media type.");
  }

  const originalName = cleanText(
    req.query.originalName,
    mediaRule.type === "IMAGE" ? "gallery-image" : "gallery-video",
    255,
    "File name"
  );
  const titleFallback = originalName.replace(/\.[^.]+$/, "");
  const title = cleanText(req.query.title, titleFallback, 120, "Title");
  const category = cleanText(req.query.category, "Memories", 40, "Category");

  const media = await createGalleryMedia(req.user.id, {
    title,
    category,
    mediaType: mediaRule.type,
    mimeType,
    originalName,
    size: req.body.length,
    data: req.body,
  });

  res.status(201).json({
    success: true,
    message: "Gallery media uploaded successfully.",
    media: serializeMedia(req, media),
  });
});

const removeMedia = asyncHandler(async (req, res) => {
  const mediaId = toPositiveInt(req.params.id, "Media id");
  const media = await deleteGalleryMedia(mediaId);

  if (!media) {
    throw new ApiError(404, "Gallery media was not found.");
  }

  res.json({
    success: true,
    message: "Gallery media deleted successfully.",
  });
});

module.exports = {
  listMedia,
  removeMedia,
  streamMedia,
  uploadMedia,
};
