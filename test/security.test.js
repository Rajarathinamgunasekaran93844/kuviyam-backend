const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

process.env.NODE_ENV = "test";
process.env.DATABASE_MODE = "memory";
process.env.JWT_SECRET = "unit-test-secret-that-is-at-least-thirty-two-characters";
process.env.RAZORPAY_KEY_ID = "rzp_test_unit";
process.env.RAZORPAY_KEY_SECRET = "razorpay-unit-test-secret";

const createRateLimiter = require("../src/middleware/rateLimit");
const authenticate = require("../src/middleware/auth");
const { checkDatabase, isMemoryMode } = require("../src/config/prisma");
const { validateSecret, signToken, verifyToken } = require("../src/utils/jwt");
const { generateOTP, storeOTP, verifyOTP } = require("../src/utils/otp");
const { verifyPayment } = require("../src/utils/payment");
const {
  completePaymentOrder,
  createPendingPaymentOrder,
  addToCart,
  createProduct,
  loginUser,
  registerUser,
  setRazorpayOrderId,
  updateCartItem,
  updateProduct,
} = require("../src/services/store");

test("JWT signing requires a configured strong secret and expires", () => {
  assert.equal(validateSecret(), process.env.JWT_SECRET);
  const token = signToken({ id: 7, email: "reader@example.com" });
  assert.equal(verifyToken(token).id, 7);
  assert.throws(() => {
    const previous = process.env.JWT_SECRET;
    process.env.JWT_SECRET = "weak";
    try {
      validateSecret();
    } finally {
      process.env.JWT_SECRET = previous;
    }
  }, /at least 32 characters/);
});

test("OTP generation is numeric and a code is one-use with bounded attempts", () => {
  const otp = generateOTP();
  assert.match(otp, /^\d{6}$/);

  storeOTP("unit:valid", otp);
  assert.deepEqual(verifyOTP("unit:valid", otp), { valid: true });
  assert.equal(verifyOTP("unit:valid", otp).valid, false);

  storeOTP("unit:attempts", "123456");
  for (let attempt = 0; attempt < 5; attempt += 1) {
    assert.equal(verifyOTP("unit:attempts", "000000").valid, false);
  }
  assert.equal(verifyOTP("unit:attempts", "123456").valid, false);
});

test("payment signatures are checked and malformed signatures are rejected", () => {
  const orderId = "order_test_123";
  const paymentId = "pay_test_456";
  const signature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");

  assert.equal(verifyPayment(orderId, paymentId, signature), true);
  assert.equal(verifyPayment(orderId, paymentId, "0".repeat(64)), false);
  assert.equal(verifyPayment(orderId, paymentId, "bad"), false);
});

test("rate limits return 429 after the configured request budget", () => {
  const limiter = createRateLimiter({ windowMs: 60_000, max: 1 });
  const errors = [];
  const makeResponse = () => ({ set() {} });
  const request = { ip: "203.0.113.12", socket: { remoteAddress: "local" } };

  limiter(request, makeResponse(), (error) => { if (error) errors.push(error); });
  limiter(request, makeResponse(), (error) => { if (error) errors.push(error); });

  assert.equal(errors.length, 1);
  assert.equal(errors[0].statusCode, 429);
});

test("registration stores a password hash and login returns no credential", async () => {
  const credentials = {
    name: "Test Reader",
    email: "reader.unit@example.com",
    phone: "9600021480",
    address: "Test address",
    password: "unit-test-password-123",
  };

  const user = await registerUser(credentials);
  assert.equal(Object.hasOwn(user, "password"), false);

  const loggedIn = await loginUser({ email: credentials.email, password: credentials.password });
  assert.equal(loggedIn.id, user.id);
  await assert.rejects(
    loginUser({ email: credentials.email, password: "wrong-password" }),
    (error) => error.statusCode === 401
  );
});

test("payment orders use catalog prices and only become paid once verified", async () => {
  const order = await createPendingPaymentOrder(1, {
    customer: { name: "Test Reader", phone: "9600021480", address: "Test address" },
    items: [{ productId: 1, quantity: 2, price: 0.01, title: "Forged title" }],
  });

  assert.equal(order.total, 160);
  assert.equal(order.status, "PENDING_PAYMENT");
  assert.equal(order.items[0].price, 80);

  await setRazorpayOrderId(1, order.id, "order_linked_unit");
  const paid = await completePaymentOrder(1, "order_linked_unit", "pay_linked_unit");
  assert.equal(paid.status, "PAID");
  assert.equal(
    (await completePaymentOrder(1, "order_linked_unit", "pay_linked_unit")).status,
    "PAID"
  );
  await assert.rejects(
    completePaymentOrder(1, "order_linked_unit", "pay_replay_unit"),
    (error) => error.statusCode === 409
  );
});

test("cart quantities stay within order limits", async () => {
  await assert.rejects(
    addToCart(77, { productId: 1, quantity: 51 }),
    (error) => error.statusCode === 400
  );

  await addToCart(77, { productId: 1, quantity: 50 });
  await assert.rejects(
    addToCart(77, { productId: 1, quantity: 1 }),
    (error) => error.statusCode === 400
  );
  await assert.rejects(
    updateCartItem(77, 1, 51),
    (error) => error.statusCode === 400
  );
});

test("product writes validate catalog prices and image URLs", async () => {
  await assert.rejects(
    createProduct({ title: "Invalid book", category: "Stories", price: -1 }),
    (error) => error.statusCode === 400
  );
  await assert.rejects(
    createProduct({
      title: "Invalid image book",
      category: "Stories",
      price: 20,
      images: ["javascript:alert(1)"],
    }),
    (error) => error.statusCode === 400
  );

  const product = await createProduct({
    title: "Validated book",
    category: "Stories",
    price: 20,
    images: ["/Arivuamudhu_book.png"],
  });
  await assert.rejects(
    updateProduct(product.id, { price: 0 }),
    (error) => error.statusCode === 400
  );
});

test("development health mode is explicit and payment authentication fails closed", async () => {
  assert.equal(isMemoryMode(), true);
  assert.equal(await checkDatabase(), true);

  const authError = await new Promise((resolve) =>
    authenticate({ headers: {} }, {}, resolve)
  );
  assert.equal(authError.statusCode, 401);
});
