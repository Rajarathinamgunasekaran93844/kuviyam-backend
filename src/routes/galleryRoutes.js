const express = require("express");

const authenticate = require("../middleware/auth");
const adminAuth = require("../middleware/adminAuth");
const {
  listMedia,
  createVideoUpload,
  getMediaStatus,
  removeMedia,
  streamMedia,
  uploadMedia,
} = require("../controllers/galleryController");

const router = express.Router();

router.get("/", listMedia);
router.post("/video-upload", authenticate, adminAuth, createVideoUpload);
router.get("/:id/status", authenticate, adminAuth, getMediaStatus);
router.get("/:id/file", streamMedia);

router.post(
  "/",
  authenticate,
  adminAuth,
  express.raw({ type: () => true, limit: "50mb" }),
  uploadMedia
);
router.delete("/:id", authenticate, adminAuth, removeMedia);

module.exports = router;
