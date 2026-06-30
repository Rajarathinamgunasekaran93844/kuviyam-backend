const express = require("express");

const authenticate = require("../middleware/auth");
const adminAuth = require("../middleware/adminAuth");
const {
  listMedia,
  removeMedia,
  streamMedia,
  uploadMedia,
} = require("../controllers/galleryController");

const router = express.Router();

router.get("/", listMedia);
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
