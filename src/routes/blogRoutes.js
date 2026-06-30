const express = require("express");
const router = express.Router();

const {
  getPublishedBlogs,
  getBlogBySlug,
} = require("../controllers/blogController");

router.get("/", getPublishedBlogs);
router.get("/:slug", getBlogBySlug);

module.exports = router;
