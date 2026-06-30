const express = require("express");

const authenticate = require("../middleware/auth");
const {
  addItem,
  listWishlist,
  removeItem,
} = require("../controllers/wishlistController");

const router = express.Router();

router.use(authenticate);

router.get("/", listWishlist);
router.post("/", addItem);
router.post("/:productId", addItem);
router.delete("/:productId", removeItem);

module.exports = router;
