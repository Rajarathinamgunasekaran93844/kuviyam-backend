const express = require("express");

const authenticate = require("../middleware/auth");
const {
  addItem,
  clear,
  listCart,
  removeItem,
  updateItem,
} = require("../controllers/cartController");

const router = express.Router();

router.use(authenticate);

router.get("/", listCart);
router.post("/", addItem);
router.post("/items", addItem);
router.patch("/:productId", updateItem);
router.patch("/items/:productId", updateItem);
router.delete("/:productId", removeItem);
router.delete("/items/:productId", removeItem);
router.delete("/", clear);

module.exports = router;
