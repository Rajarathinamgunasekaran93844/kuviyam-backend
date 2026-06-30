const express = require("express");
const authenticate = require("../middleware/auth");
const adminAuth = require("../middleware/adminAuth");
const {
  getStats,
  getOrders,
  getUsers,
  getProducts,
  getMessages,
  getWishlist,
  createProduct,
  deleteProduct,
  updateProduct,
} = require("../controllers/adminController");
const {
  createBlog,
  getAllBlogsAdmin,
  updateBlog,
  deleteBlog,
} = require("../controllers/blogController");

const router = express.Router();

// All admin routes require authentication and admin privileges
router.use(authenticate, adminAuth);

router.get("/stats", getStats);
router.get("/orders", getOrders);
router.get("/users", getUsers);
router.get("/products", getProducts);
router.get("/wishlist", getWishlist);
router.get("/messages", getMessages);


// Product Management
router.post("/products", createProduct);
router.put("/products/:id", updateProduct);
router.delete("/products/:id", deleteProduct);


// Blog Management
router.post("/blogs", createBlog);
router.get("/blogs", getAllBlogsAdmin);
router.put("/blogs/:id", updateBlog);
router.delete("/blogs/:id", deleteBlog);



module.exports = router;
