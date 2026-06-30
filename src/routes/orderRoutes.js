const express = require("express");

const authenticate = require("../middleware/auth");
const {
  listOrders,
  placeOrder,
  showLatestOrder,
  showOrder,
} = require("../controllers/orderController");

const router = express.Router();

router.use(authenticate);

router.get("/", listOrders);
router.post("/", placeOrder);
router.get("/latest", showLatestOrder);
router.get("/:id", showOrder);

module.exports = router;
