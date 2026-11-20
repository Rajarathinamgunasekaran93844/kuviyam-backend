const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { toPositiveInt } = require("../utils/validators");
const {
  createGalleryMedia,
  deleteGalleryMedia,
  getGalleryMedia,
  getGalleryMediaById,
  getGalleryMediaByMuxId,
  getGalleryMediaFile,
  updateGalleryMedia,
} = require("../services/store");
const {
  getCloudinaryConfiguration,
  uploadImageBuffer,
  deleteCloudinaryImage,
} = require("../services/cloudinary");
const mux = require("../services/mux");

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

const serializeMedia = (req, media) => {
  const playbackId = media.playbackId || null;
  const isMuxVideo = media.storageProvider === "MUX";

  return {
    id: media.id,
    title: media.title,
    category: media.category,
    mediaType: media.mediaType,
    mimeType: media.mimeType,
    originalName: media.originalName,
    size: media.size,
    createdAt: media.createdAt,
    storageProvider: media.storageProvider || "DATABASE",
    assetStatus: media.assetStatus || null,
    playbackId,
    thumbnailUrl: playbackId
      ? `https://image.mux.com/${encodeURIComponent(playbackId)}/thumbnail.jpg?time=0`
      : null,
    url: media.externalUrl ||
      (playbackId
        ? `https://stream.mux.com/${encodeURIComponent(playbackId)}.m3u8`
        : mediaUrl(req, media.id)),
    ...(isMuxVideo ? { isProcessing: media.assetStatus !== "READY" } : {}),
  };
};

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

  if (!media.data && media.externalUrl) {
    return res.redirect(302, media.externalUrl);
  }

  if (!media.data) {
    throw new ApiError(404, "Gallery media file was not found.");
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

  if (mediaRule.type === "VIDEO" && process.env.NODE_ENV === "production") {
    throw new ApiError(400, "Upload videos using the Mux direct upload flow.");
  }

  let cloudinaryUpload = null;
  if (mediaRule.type === "IMAGE") {
    const cloudinary = getCloudinaryConfiguration();
    if (cloudinary) {
      try {
        cloudinaryUpload = await uploadImageBuffer(req.body);
      } catch {
        throw new ApiError(502, "Cloudinary could not store the image. Please try again.");
      }
    } else if (process.env.NODE_ENV === "production") {
      throw new ApiError(503, "Cloudinary must be configured before images can be uploaded.");
    }
  }

  let media;
  try {
    media = await createGalleryMedia(req.user.id, {
      title,
      category,
      mediaType: mediaRule.type,
      mimeType,
      originalName,
      size: cloudinaryUpload?.bytes || req.body.length,
      data: cloudinaryUpload ? undefined : req.body,
      storageProvider: cloudinaryUpload ? "CLOUDINARY" : "DATABASE",
      storageKey: cloudinaryUpload?.publicId,
      externalUrl: cloudinaryUpload?.url,
      assetStatus: cloudinaryUpload ? "READY" : null,
    });
  } catch (error) {
    if (cloudinaryUpload) {
      await deleteCloudinaryImage(cloudinaryUpload.publicId).catch(() => {});
    }
    throw error;
  }

  res.status(201).json({
    success: true,
    message: "Gallery media uploaded successfully.",
    media: serializeMedia(req, media),
  });
});

const allowedUploadOrigin = (req) => {
  const origins = (process.env.CLIENT_URL ||
    "https://kuviyam-ecommerce.vercel.app,http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean);
  const requestOrigin = String(req.get("origin") || "").replace(/\/$/, "");

  if (requestOrigin && !origins.includes(requestOrigin)) {
    throw new ApiError(403, "This website is not allowed to upload gallery videos.");
  }

  const origin = requestOrigin || origins[0];
  if (!origin) throw new ApiError(503, "Configure CLIENT_URL before enabling Mux uploads.");
  return origin;
};

const createVideoUpload = asyncHandler(async (req, res) => {
  if (!mux.hasMuxCredentials()) {
    if (process.env.MUX_TOKEN_ID || process.env.MUX_TOKEN_SECRET) {
      throw new ApiError(503, "Mux configuration is incomplete.");
    }
    if (process.env.NODE_ENV === "production") {
      throw new ApiError(503, "Mux must be configured before videos can be uploaded.");
    }
    return res.json({ success: true, uploadStrategy: "DATABASE" });
  }

  const mimeType = String(req.body?.mimeType || "").trim().toLowerCase();
  const mediaRule = allowedMedia[mimeType];
  const size = Number(req.body?.size);
  const sizeLimit = Number(process.env.MUX_MAX_VIDEO_UPLOAD_BYTES || 2_000_000_000);

  if (!mediaRule || mediaRule.type !== "VIDEO") {
    throw new ApiError(415, "Mux uploads accept MP4 or WebM video files.");
  }
  if (!Number.isSafeInteger(size) || size <= 0) {
    throw new ApiError(400, "A valid video file size is required.");
  }
  if (!Number.isSafeInteger(sizeLimit) || sizeLimit <= 0) {
    throw new ApiError(503, "MUX_MAX_VIDEO_UPLOAD_BYTES must be a positive whole number.");
  }
  if (size > sizeLimit) {
    throw new ApiError(413, `Videos must be smaller than ${Math.floor(sizeLimit / 1024 / 1024)} MB.`);
  }

  const originalName = cleanText(req.body.fileName, "gallery-video", 255, "File name");
  const title = cleanText(
    req.body.title,
    originalName.replace(/\.[^.]+$/, ""),
    120,
    "Title"
  );
  const category = cleanText(req.body.category, "Memories", 40, "Category");
  const media = await createGalleryMedia(req.user.id, {
    title,
    category,
    mediaType: "VIDEO",
    mimeType,
    originalName,
    size,
    storageProvider: "MUX",
    assetStatus: "WAITING_FOR_UPLOAD",
  });

  try {
    const upload = await mux.createDirectUpload({
      corsOrigin: allowedUploadOrigin(req),
      mediaId: media.id,
    });
    if (!upload?.id || !upload?.url) {
      throw new ApiError(502, "Mux did not return a valid upload URL.");
    }

    const savedMedia = await updateGalleryMedia(media.id, {
      providerUploadId: upload.id,
      assetStatus: "UPLOADING",
    });

    return res.status(201).json({
      success: true,
      uploadStrategy: "MUX",
      uploadUrl: upload.url,
      media: serializeMedia(req, savedMedia),
    });
  } catch (error) {
    await deleteGalleryMedia(media.id).catch(() => {});
    throw error;
  }
});

const getMediaStatus = asyncHandler(async (req, res) => {
  const mediaId = toPositiveInt(req.params.id, "Media id");
  let media = await getGalleryMediaById(mediaId);

  if (!media) throw new ApiError(404, "Gallery media was not found.");

  if (
    media.storageProvider === "MUX" &&
    media.providerUploadId &&
    media.assetStatus !== "READY" &&
    media.assetStatus !== "ERRORED"
  ) {
    const upload = await mux.getUpload(media.providerUploadId);
    if (upload?.asset_id) {
      const asset = await mux.getAsset(upload.asset_id);
      const status = String(asset?.status || "preparing").toUpperCase();
      const playbackId = asset?.playback_ids?.find((item) => item.policy === "public")?.id ||
        asset?.playback_ids?.[0]?.id || null;
      await updateGalleryMedia(mediaId, {
        providerAssetId: asset?.id || upload.asset_id,
        playbackId,
        assetStatus: status === "READY" || status === "ERRORED" ? status : "PROCESSING",
      });
      media = await getGalleryMediaById(mediaId);
    }
  }

  return res.json({ success: true, media: serializeMedia(req, media) });
});

const handleMuxWebhook = asyncHandler(async (req, res) => {
  const secret = process.env.MUX_WEBHOOK_SECRET;
  if (!secret) throw new ApiError(503, "Mux webhook signing secret is not configured.");

  if (!mux.verifyWebhook(req.body, req.get("mux-signature"), secret)) {
    throw new ApiError(401, "Mux webhook signature is invalid.");
  }

  let event;
  try {
    event = JSON.parse(req.body.toString("utf8"));
  } catch {
    throw new ApiError(400, "Mux webhook payload is invalid.");
  }

  const data = event?.data;
  let mediaId = Number(data?.passthrough);
  let existingMedia = Number.isSafeInteger(mediaId) && mediaId > 0
    ? await getGalleryMediaById(mediaId)
    : null;

  if (!existingMedia && data?.id) {
    const reference = await getGalleryMediaByMuxId({
      uploadId: event.type === "video.upload.asset_created" ? data.id : undefined,
      assetId: event.type === "video.upload.asset_created" ? undefined : data.id,
    });
    mediaId = reference?.id;
    existingMedia = reference;
  }

  if (!existingMedia || existingMedia.storageProvider !== "MUX") {
    return res.json({ success: true, received: true });
  }

  if (event.type === "video.upload.asset_created") {
    await updateGalleryMedia(mediaId, {
      providerAssetId: data.asset_id,
      assetStatus: "PROCESSING",
    });
  } else if (event.type === "video.asset.ready") {
    const playbackId = data.playback_ids?.find((item) => item.policy === "public")?.id ||
      data.playback_ids?.[0]?.id || null;
    await updateGalleryMedia(mediaId, {
      providerAssetId: data.id,
      playbackId,
      assetStatus: "READY",
    });
  } else if (event.type === "video.asset.errored") {
    await updateGalleryMedia(mediaId, {
      providerAssetId: data.id,
      assetStatus: "ERRORED",
    });
  }

  return res.json({ success: true, received: true });
});

const removeMedia = asyncHandler(async (req, res) => {
  const mediaId = toPositiveInt(req.params.id, "Media id");
  const media = await getGalleryMediaById(mediaId);

  if (!media) {
    throw new ApiError(404, "Gallery media was not found.");
  }

  if (media.storageProvider === "CLOUDINARY" && media.storageKey) {
    await deleteCloudinaryImage(media.storageKey);
  } else if (media.storageProvider === "MUX") {
    if (media.providerAssetId) await mux.deleteAsset(media.providerAssetId);
    else if (media.providerUploadId) {
      const upload = await mux.getUpload(media.providerUploadId);
      if (upload?.asset_id) await mux.deleteAsset(upload.asset_id);
      else await mux.cancelUpload(media.providerUploadId);
    }
  }

  await deleteGalleryMedia(mediaId);

  res.json({
    success: true,
    message: "Gallery media deleted successfully.",
  });
});

module.exports = {
  listMedia,
  createVideoUpload,
  getMediaStatus,
  handleMuxWebhook,
  removeMedia,
  streamMedia,
  uploadMedia,
};
