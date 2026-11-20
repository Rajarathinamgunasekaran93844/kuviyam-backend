const crypto = require("node:crypto");
const ApiError = require("../utils/ApiError");

const hasMuxCredentials = () =>
  Boolean(process.env.MUX_TOKEN_ID && process.env.MUX_TOKEN_SECRET);

const assertMuxCredentials = () => {
  if (!process.env.MUX_TOKEN_ID && !process.env.MUX_TOKEN_SECRET) {
    throw new ApiError(503, "Mux is not configured.");
  }
  if (!hasMuxCredentials()) {
    throw new ApiError(503, "Mux configuration is incomplete.");
  }
};

const muxRequest = async (path, { method = "GET", body } = {}) => {
  assertMuxCredentials();
  const auth = Buffer.from(
    `${process.env.MUX_TOKEN_ID}:${process.env.MUX_TOKEN_SECRET}`
  ).toString("base64");

  let response;
  try {
    response = await fetch(`https://api.mux.com/video/v1${path}`, {
      method,
      headers: {
        Authorization: `Basic ${auth}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new ApiError(502, "Mux could not be reached. Please try again.");
  }

  if (response.status === 204) return null;
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(502, "Mux could not complete the video request.");
  }
  return result?.data ?? result;
};

const createDirectUpload = ({ corsOrigin, mediaId }) =>
  muxRequest("/uploads", {
    method: "POST",
    body: {
      cors_origin: corsOrigin,
      new_asset_settings: {
        playback_policies: ["public"],
        passthrough: String(mediaId),
        video_quality: "basic",
      },
      timeout: 3600,
    },
  });

const getUpload = (uploadId) =>
  muxRequest(`/uploads/${encodeURIComponent(uploadId)}`);

const getAsset = (assetId) =>
  muxRequest(`/assets/${encodeURIComponent(assetId)}`);

const deleteAsset = (assetId) =>
  muxRequest(`/assets/${encodeURIComponent(assetId)}`, { method: "DELETE" });

const cancelUpload = (uploadId) =>
  muxRequest(`/uploads/${encodeURIComponent(uploadId)}/cancel`, { method: "PUT" });

const verifyWebhook = (body, signatureHeader, secret) => {
  if (!Buffer.isBuffer(body) || !signatureHeader || !secret) return false;

  const values = Object.fromEntries(
    signatureHeader.split(",").map((item) => {
      const [key, value] = item.trim().split("=");
      return [key, value];
    })
  );
  const timestamp = values.t;
  const signature = values.v1;
  const parsedTimestamp = Number(timestamp);

  if (
    !timestamp ||
    !/^[a-f\d]{64}$/i.test(signature || "") ||
    !Number.isInteger(parsedTimestamp) ||
    Math.abs(Date.now() / 1000 - parsedTimestamp) > 300
  ) {
    return false;
  }

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${body.toString("utf8")}`)
    .digest();
  const supplied = Buffer.from(signature, "hex");

  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
};

module.exports = {
  hasMuxCredentials,
  createDirectUpload,
  getUpload,
  getAsset,
  deleteAsset,
  cancelUpload,
  verifyWebhook,
};
