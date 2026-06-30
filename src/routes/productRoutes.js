const express = require("express");

const {
  listProducts,
  showProduct,
} = require("../controllers/productController");

const router = express.Router();

router.get("/", listProducts);
router.get("/:id", showProduct);

module.exports = router;
