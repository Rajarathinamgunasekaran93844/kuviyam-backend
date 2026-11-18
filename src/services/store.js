const bcrypt = require("bcryptjs");

const seedProducts = require("../data/products");
const { withPrisma } = require("../config/prisma");
const ApiError = require("../utils/ApiError");
const { requireFields, requirePhone } = require("../utils/validators");

const now = () => new Date().toISOString();
let seedProductsPromise = null;

const memory = {
  users: [],
  products: seedProducts.map((product) => ({
    ...product,
    createdAt: now(),
    updatedAt: now(),
  })),
  carts: [],
  orders: [],
  wishlist: [],
  contactMessages: [],
  galleryMedia: [],
  nextUserId: 1,
  nextCartId: 1,
  nextOrderId: 1,
  nextOrderItemId: 1,
  nextWishlistId: 1,
  nextContactMessageId: 1,
  nextGalleryMediaId: 1,
  nextProductId: seedProducts.length + 1, // Start after seed products
};

const normalizeEmail = (email) => String(email || "").trim().toLowerCase();

const normalizeProduct = (product) => {
  if (!product) {
    return null;
  }

  const images = Array.isArray(product.images)
    ? product.images
    : product.image
      ? [product.image]
      : [];

  const { image, ...rest } = product;

  return {
    ...rest,
    images,
  };
};

const publicUser = (user) => {
  if (!user) {
    return null;
  }

  // Keep isAdmin field, remove password
  const { password, ...safeUser } = user;
  return safeUser;
};

const comparePassword = async (plainPassword, storedPassword) => {
  if (!storedPassword) {
    return false;
  }

  if (!/^\$2[aby]\$\d{2}\$/.test(storedPassword)) {
    // Legacy plaintext credentials are upgraded after a successful login.
    return plainPassword === storedPassword;
  }

  return bcrypt.compare(plainPassword, storedPassword).catch(() => false);
};

const passwordNeedsUpgrade = (storedPassword) =>
  !/^\$2[aby]\$\d{2}\$/.test(storedPassword) || bcrypt.getRounds(storedPassword) < 12;

const productWriteData = (product) => ({
  title: product.title,
  category: product.category,
  price: product.price,
  images: product.images,
  description: product.description,
});

const ensureSeedProducts = async (db) => {
  if (!seedProductsPromise) {
    seedProductsPromise = (async () => {
      await db.product.createMany({
        data: seedProducts.map((product) => ({
          id: product.id,
          ...productWriteData(product),
        })),
        skipDuplicates: true,
      });

      const maxIdResult = await db.product.aggregate({ _max: { id: true } });
      const maxId = maxIdResult._max.id || seedProducts.length;
      memory.nextProductId = maxId + 1;
      await db.$queryRaw`SELECT setval(pg_get_serial_sequence('"Product"', 'id'), COALESCE((SELECT MAX(id) FROM "Product"), 1), true)`;
    })().catch((error) => {
      seedProductsPromise = null;
      throw error;
    });
  }

  return seedProductsPromise;
};

const getMemoryProduct = (id) =>
  memory.products.find((product) => product.id === Number(id));

const getDbCart = async (db, userId) => {
  const rows = await db.cart.findMany({
    where: {
      userId,
    },
    include: {
      product: true,
    },
    orderBy: {
      id: "asc",
    },
  });

  return formatCart(rows);
};

const getMemoryCart = (userId) => {
  const rows = memory.carts
    .filter((item) => item.userId === Number(userId))
    .map((item) => ({
      ...item,
      product: getMemoryProduct(item.productId),
    }))
    .filter((item) => item.product);

  return formatCart(rows);
};

const formatCart = (rows) => {
  const cartItems = rows.map((item) => ({
    ...normalizeProduct(item.product),
    quantity: item.quantity,
  }));

  const totalItems = cartItems.reduce(
    (total, item) => total + item.quantity,
    0
  );

  const totalPrice = cartItems.reduce(
    (total, item) => total + item.price * item.quantity,
    0
  );

  return {
    cartItems,
    totalItems,
    totalPrice,
  };
};

const buildOrderItem = (incomingItem, product) => {
  const source = normalizeProduct(product);
  const quantity = Number(incomingItem.quantity);
  const price = Number(source.price);
  if (!Number.isFinite(price) || price <= 0) {
    throw new ApiError(400, "One of the selected books has an invalid price.");
  }
  const productImage = source?.images?.[0] || null;
  const lineTotal = price * quantity;

  return {
    productId: product.id,
    productTitle: source.title,
    productCategory: source.category,
    productImage,
    quantity,
    price,
    lineTotal,
    responseItem: {
      id: product.id,
      title: source.title,
      category: source.category,
      price,
      images: source.images,
      quantity,
    },
  };
};

const formatOrder = (order) => ({
  id: order.id,
  customer: {
    name: order.customerName,
    phone: order.customerPhone,
    address: order.customerAddress,
  },
  items: (order.items || []).map((item) => ({
    id: item.productId || item.id,
    title: item.productTitle,
    category: item.productCategory,
    price: item.price,
    images: item.productImage ? [item.productImage] : [],
    quantity: item.quantity,
  })),
  total: order.total,
  status: order.status,
  paymentMethod: order.paymentMethod,
  createdAt: order.createdAt,
});

const getProducts = async ({ search, category } = {}) => {
  const searchValue = String(search || "").trim();
  const categoryValue = String(category || "").trim();

  return withPrisma(
    async (db) => {
      await ensureSeedProducts(db);

      const products = await db.product.findMany({
        where: {
          ...(categoryValue ? { category: categoryValue } : {}),
          ...(searchValue
            ? {
                OR: [
                  {
                    title: {
                      contains: searchValue,
                      mode: "insensitive",
                    },
                  },
                  {
                    category: {
                      contains: searchValue,
                      mode: "insensitive",
                    },
                  },
                  {
                    description: {
                      contains: searchValue,
                      mode: "insensitive",
                    },
                  },
                ],
              }
            : {}),
        },
        orderBy: {
          id: "asc",
        },
      });

      return products.map(normalizeProduct);
    },
    async () => {
      const lowerSearch = searchValue.toLowerCase();
      const lowerCategory = categoryValue.toLowerCase();

      return memory.products
        .filter((product) => {
          const matchesSearch =
            !lowerSearch ||
            product.title.toLowerCase().includes(lowerSearch) ||
            product.category.toLowerCase().includes(lowerSearch) ||
            product.description.toLowerCase().includes(lowerSearch);

          const matchesCategory =
            !lowerCategory || product.category.toLowerCase() === lowerCategory;

          return matchesSearch && matchesCategory;
        })
        .map(normalizeProduct);
    }
  );
};

const getProductById = async (id) => {
  const productId = Number(id);

  return withPrisma(
    async (db) => {
      await ensureSeedProducts(db);

      const product = await db.product.findUnique({
        where: {
          id: productId,
        },
      });

      return normalizeProduct(product);
    },
    async () => normalizeProduct(getMemoryProduct(productId))
  );
};

const registerUser = async ({ name, email, phone, address, password }) => {
  const normalizedEmail = normalizeEmail(email);
  const passwordHash = await bcrypt.hash(password, 12);

  return withPrisma(
    async (db) => {
      const existingUser = await db.user.findUnique({
        where: {
          email: normalizedEmail,
        },
      });

      if (existingUser) {
        throw new ApiError(409, "Account already exists with this email.");
      }

      const user = await db.user.create({
        data: {
          name: name.trim(),
          email: normalizedEmail,
          phone: phone?.trim() || null,
          address: address?.trim() || null,
          password: passwordHash,
        },
      });

      return publicUser(user);
    },
    async () => {
      const existingUser = memory.users.find(
        (user) => user.email === normalizedEmail
      );

      if (existingUser) {
        throw new ApiError(409, "Account already exists with this email.");
      }

      const user = {
        id: memory.nextUserId,
        name: name.trim(),
        email: normalizedEmail,
        phone: phone?.trim() || null,
        address: address?.trim() || null,
        password: passwordHash,
        createdAt: now(),
        updatedAt: now(),
      };

      memory.nextUserId += 1;
      memory.users.push(user);

      return publicUser(user);
    }
  );
};

const loginUser = async ({ email, password }) => {
  const normalizedEmail = normalizeEmail(email);

  return withPrisma(
    async (db) => {
      const user = await db.user.findUnique({
        where: {
          email: normalizedEmail,
        },
      });

      if (!user || !(await comparePassword(password, user.password))) {
        throw new ApiError(401, "Invalid email or password.");
      }

      if (passwordNeedsUpgrade(user.password)) {
        await db.user.update({
          where: { id: user.id },
          data: { password: await bcrypt.hash(password, 12) },
        });
      }

      return publicUser(user);
    },
    async () => {
      const user = memory.users.find((item) => item.email === normalizedEmail);

      if (!user || !(await comparePassword(password, user.password))) {
        throw new ApiError(401, "Invalid email or password.");
      }

      if (passwordNeedsUpgrade(user.password)) {
        user.password = await bcrypt.hash(password, 12);
      }

      return publicUser(user);
    }
  );
};

const getUserById = async (id) => {
  const userId = Number(id);

  return withPrisma(
    async (db) => {
      const user = await db.user.findUnique({
        where: {
          id: userId,
        },
      });

      return publicUser(user);
    },
    async () => publicUser(memory.users.find((user) => user.id === userId))
  );
};

const getUserByEmail = async (email) => {
  const normalizedEmail = normalizeEmail(email);

  return withPrisma(
    async (db) => {
      const user = await db.user.findUnique({
        where: {
          email: normalizedEmail,
        },
      });

      return publicUser(user);
    },
    async () => publicUser(memory.users.find((user) => user.email === normalizedEmail))
  );
};

const updateUser = async (userId, payload) => {
  const updateData = {};

  ["name", "phone", "address"].forEach((field) => {
    if (payload[field] !== undefined) {
      updateData[field] = payload[field] ? String(payload[field]).trim() : null;
    }
  });

  if (payload.email !== undefined) {
    updateData.email = normalizeEmail(payload.email);
  }

  if (payload.password) {
    updateData.password = await bcrypt.hash(payload.password, 12);
  }

  return withPrisma(
    async (db) => {
      if (updateData.email) {
        const existingUser = await db.user.findUnique({
          where: {
            email: updateData.email,
          },
        });

        if (existingUser && existingUser.id !== Number(userId)) {
          throw new ApiError(409, "Account already exists with this email.");
        }
      }

      const user = await db.user.update({
        where: {
          id: Number(userId),
        },
        data: updateData,
      });

      return publicUser(user);
    },
    async () => {
      const user = memory.users.find((item) => item.id === Number(userId));

      if (!user) {
        throw new ApiError(404, "User not found.");
      }

      if (updateData.email) {
        const existingUser = memory.users.find(
          (item) => item.email === updateData.email && item.id !== user.id
        );

        if (existingUser) {
          throw new ApiError(409, "Account already exists with this email.");
        }
      }

      Object.assign(user, updateData, {
        updatedAt: now(),
      });

      return publicUser(user);
    }
  );
};

const getCart = async (userId) =>
  withPrisma(
    async (db) => getDbCart(db, Number(userId)),
    async () => getMemoryCart(userId)
  );

const addToCart = async (userId, payload = {}) => {
  const productId = Number(payload.productId ?? payload.product?.id ?? payload.id);
  const quantity = Number(payload.quantity ?? 1);

  if (!Number.isSafeInteger(productId) || productId < 1) {
    throw new ApiError(400, "Product id is required.");
  }
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 50) {
    throw new ApiError(400, "Cart item quantity must be between 1 and 50.");
  }

  return withPrisma(
    async (db) => {
      await ensureSeedProducts(db);

      const product = await db.product.findUnique({
        where: {
          id: productId,
        },
      });

      if (!product) {
        throw new ApiError(404, "Product not found.");
      }

      const cartWhere = {
        userId: Number(userId),
        productId,
      };
      const boundedIncrement = () =>
        db.cart.updateMany({
          where: { ...cartWhere, quantity: { lte: 50 - quantity } },
          data: { quantity: { increment: quantity } },
        });

      const updated = await boundedIncrement();
      if (updated.count === 0) {
        try {
          await db.cart.create({ data: { ...cartWhere, quantity } });
        } catch (error) {
          if (error.code !== "P2002") throw error;
          const retried = await boundedIncrement();
          if (retried.count !== 1) {
            throw new ApiError(400, "Cart item quantity cannot exceed 50.");
          }
        }
      }

      return getDbCart(db, Number(userId));
    },
    async () => {
      const product = getMemoryProduct(productId);

      if (!product) {
        throw new ApiError(404, "Product not found.");
      }

      const existingItem = memory.carts.find(
        (item) => item.userId === Number(userId) && item.productId === productId
      );

      if (existingItem) {
        if (existingItem.quantity + quantity > 50) {
          throw new ApiError(400, "Cart item quantity cannot exceed 50.");
        }
        existingItem.quantity += quantity;
      } else {
        memory.carts.push({
          id: memory.nextCartId,
          userId: Number(userId),
          productId,
          quantity,
        });

        memory.nextCartId += 1;
      }

      return getMemoryCart(userId);
    }
  );
};

const updateCartItem = async (userId, productId, quantity) => {
  const nextQuantity = Number(quantity);
  const parsedProductId = Number(productId);

  if (!Number.isSafeInteger(parsedProductId) || parsedProductId < 1) {
    throw new ApiError(400, "Product id must be a positive integer.");
  }
  if (!Number.isSafeInteger(nextQuantity) || nextQuantity < 1 || nextQuantity > 50) {
    throw new ApiError(400, "Cart item quantity must be between 1 and 50.");
  }

  return withPrisma(
    async (db) => {
      const existingItem = await db.cart.findUnique({
        where: {
          userId_productId: {
            userId: Number(userId),
            productId: parsedProductId,
          },
        },
      });

      if (!existingItem) {
        throw new ApiError(404, "Cart item not found.");
      }

      await db.cart.update({
        where: {
          userId_productId: {
            userId: Number(userId),
            productId: parsedProductId,
          },
        },
        data: {
          quantity: nextQuantity,
        },
      });

      return getDbCart(db, Number(userId));
    },
    async () => {
      const existingItem = memory.carts.find(
        (item) =>
          item.userId === Number(userId) && item.productId === parsedProductId
      );

      if (!existingItem) {
        throw new ApiError(404, "Cart item not found.");
      }

      existingItem.quantity = nextQuantity;

      return getMemoryCart(userId);
    }
  );
};

const removeCartItem = async (userId, productId) =>
  withPrisma(
    async (db) => {
      await db.cart.deleteMany({
        where: {
          userId: Number(userId),
          productId: Number(productId),
        },
      });

      return getDbCart(db, Number(userId));
    },
    async () => {
      memory.carts = memory.carts.filter(
        (item) =>
          item.userId !== Number(userId) || item.productId !== Number(productId)
      );

      return getMemoryCart(userId);
    }
  );

const clearCart = async (userId) =>
  withPrisma(
    async (db) => {
      await db.cart.deleteMany({
        where: {
          userId: Number(userId),
        },
      });

      return getDbCart(db, Number(userId));
    },
    async () => {
      memory.carts = memory.carts.filter((item) => item.userId !== Number(userId));

      return getMemoryCart(userId);
    }
  );

const createOrder = async (
  userId,
  payload,
  { paymentMethod = "COD", status = "PLACED", clearCartAfterCreate = true } = {}
) => {
  const customer = payload.customer || {};
  const incomingItems = Array.isArray(payload.items) ? payload.items : [];

  if (incomingItems.length === 0 || incomingItems.length > 50) {
    throw new ApiError(400, "Order must contain between 1 and 50 items.");
  }

  const customerData = {
    name: String(customer.name || "").trim(),
    phone: requirePhone(customer.phone),
    address: String(customer.address || "").trim(),
  };

  if (!customerData.name || !customerData.phone || !customerData.address) {
    throw new ApiError(400, "Complete the delivery details before placing an order.");
  }
  if (customerData.name.length > 120 || customerData.address.length > 500) {
    throw new ApiError(400, "Delivery details exceed the allowed length.");
  }

  const getValidatedOrderItems = async (findProduct) => {
    const items = [];

    for (const item of incomingItems) {
      const productId = Number(item.productId || item.id);
      const quantity = Number(item.quantity);
      if (!Number.isSafeInteger(productId) || productId < 1) {
        throw new ApiError(400, "Order contains an invalid product.");
      }
      if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 50) {
        throw new ApiError(400, "Each item quantity must be between 1 and 50.");
      }

      const product = await findProduct(productId);
      if (!product) {
        throw new ApiError(404, "One of the selected books is no longer available.");
      }
      items.push(buildOrderItem({ ...item, quantity }, product));
    }

    return items;
  };

  const orderData = (orderItems) => ({
    userId: Number(userId),
    total: orderItems.reduce((sum, item) => sum + item.lineTotal, 0),
    status,
    paymentMethod,
    customerName: customerData.name,
    customerPhone: customerData.phone,
    customerAddress: customerData.address,
    items: orderItems.map((item) => ({
      quantity: item.quantity,
      price: item.price,
      lineTotal: item.lineTotal,
      productTitle: item.productTitle,
      productCategory: item.productCategory,
      productImage: item.productImage,
      productId: item.productId,
    })),
  });

  const totalIsValid = (items) => {
    const total = items.reduce((sum, item) => sum + item.lineTotal, 0);
    if (!Number.isFinite(total) || total <= 0) {
      throw new ApiError(400, "Order total must be greater than zero.");
    }
  }

  return withPrisma(
    async (db) => {
      await ensureSeedProducts(db);
      const orderItems = await getValidatedOrderItems((id) =>
        db.product.findUnique({ where: { id } })
      );
      totalIsValid(orderItems);

      const order = await db.$transaction(async (tx) => {
        const created = await tx.order.create({
          data: {
            ...orderData(orderItems),
            items: { create: orderData(orderItems).items },
          },
          include: { items: true },
        });

        if (clearCartAfterCreate) {
          await tx.cart.deleteMany({ where: { userId: Number(userId) } });
        }
        return created;
      });
      return formatOrder(order);
    },
    async () => {
      const orderItems = incomingItems.map((item) => {
        const product = getMemoryProduct(item.productId || item.id);
        if (!product) {
          throw new ApiError(404, "One of the selected books is no longer available.");
        }
        const quantity = Number(item.quantity);
        if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 50) {
          throw new ApiError(400, "Each item quantity must be between 1 and 50.");
        }
        return buildOrderItem({ ...item, quantity }, product);
      });
      totalIsValid(orderItems);

      const order = {
        id: memory.nextOrderId,
        customerName: customerData.name,
        customerPhone: customerData.phone,
        customerAddress: customerData.address,
        total: orderItems.reduce((sum, item) => sum + item.lineTotal, 0),
        status,
        paymentMethod,
        razorpayOrderId: null,
        razorpayPaymentId: null,
        userId: Number(userId),
        createdAt: now(),
        updatedAt: now(),
        items: orderItems.map((item) => ({
          id: memory.nextOrderItemId++,
          productId: item.productId,
          productTitle: item.productTitle,
          productCategory: item.productCategory,
          productImage: item.productImage,
          quantity: item.quantity,
          price: item.price,
          lineTotal: item.lineTotal,
        })),
      };

      memory.nextOrderId += 1;
      memory.orders.push(order);
      if (clearCartAfterCreate) {
        memory.carts = memory.carts.filter((item) => item.userId !== Number(userId));
      }

      return formatOrder(order);
    }
  );
};

const createPendingPaymentOrder = (userId, payload) =>
  createOrder(userId, payload, {
    paymentMethod: "RAZORPAY",
    status: "PENDING_PAYMENT",
    clearCartAfterCreate: false,
  });

const setRazorpayOrderId = async (userId, orderId, razorpayOrderId) =>
  withPrisma(
    async (db) => {
      const result = await db.order.updateMany({
        where: {
          id: Number(orderId),
          userId: Number(userId),
          status: "PENDING_PAYMENT",
          razorpayOrderId: null,
        },
        data: { razorpayOrderId },
      });
      if (result.count !== 1) {
        throw new ApiError(409, "Payment order could not be linked.");
      }
    },
    async () => {
      const order = memory.orders.find(
        (entry) => entry.id === Number(orderId) && entry.userId === Number(userId)
      );
      if (!order || order.status !== "PENDING_PAYMENT" || order.razorpayOrderId) {
        throw new ApiError(409, "Payment order could not be linked.");
      }
      order.razorpayOrderId = razorpayOrderId;
    }
  );

const markPaymentSetupFailed = async (userId, orderId) =>
  withPrisma(
    async (db) =>
      db.order.updateMany({
        where: {
          id: Number(orderId),
          userId: Number(userId),
          status: "PENDING_PAYMENT",
          razorpayOrderId: null,
        },
        data: { status: "PAYMENT_SETUP_FAILED" },
      }),
    async () => {
      const order = memory.orders.find(
        (entry) => entry.id === Number(orderId) && entry.userId === Number(userId)
      );
      if (order && order.status === "PENDING_PAYMENT" && !order.razorpayOrderId) {
        order.status = "PAYMENT_SETUP_FAILED";
      }
    }
  );

const getPaymentOrder = async (userId, razorpayOrderId) =>
  withPrisma(
    async (db) => {
      const order = await db.order.findFirst({
        where: { userId: Number(userId), razorpayOrderId },
        include: { items: true },
      });
      return order ? formatOrder(order) : null;
    },
    async () => {
      const order = memory.orders.find(
        (entry) =>
          entry.userId === Number(userId) && entry.razorpayOrderId === razorpayOrderId
      );
      return order ? formatOrder(order) : null;
    }
  );

const completePaymentOrder = async (userId, razorpayOrderId, razorpayPaymentId) =>
  withPrisma(
    async (db) =>
      db.$transaction(async (tx) => {
        const existing = await tx.order.findFirst({
          where: { userId: Number(userId), razorpayOrderId },
          include: { items: true },
        });
        if (!existing) return null;
        if (
          existing.status === "PAID" &&
          existing.razorpayPaymentId === razorpayPaymentId
        ) {
          return formatOrder(existing);
        }

        const result = await tx.order.updateMany({
          where: {
            id: existing.id,
            userId: Number(userId),
            status: "PENDING_PAYMENT",
            razorpayPaymentId: null,
          },
          data: { status: "PAID", razorpayPaymentId },
        });
        if (result.count !== 1) {
          throw new ApiError(409, "This payment order has already been completed.");
        }

        await tx.cart.deleteMany({ where: { userId: Number(userId) } });
        const paidOrder = await tx.order.findUnique({
          where: { id: existing.id },
          include: { items: true },
        });
        return formatOrder(paidOrder);
      }),
    async () => {
      const order = memory.orders.find(
        (entry) =>
          entry.userId === Number(userId) && entry.razorpayOrderId === razorpayOrderId
      );
      if (!order) return null;
      if (order.status === "PAID" && order.razorpayPaymentId === razorpayPaymentId) {
        return formatOrder(order);
      }
      if (order.status !== "PENDING_PAYMENT" || order.razorpayPaymentId) {
        throw new ApiError(409, "This payment order has already been completed.");
      }

      order.status = "PAID";
      order.razorpayPaymentId = razorpayPaymentId;
      order.updatedAt = now();
      memory.carts = memory.carts.filter((item) => item.userId !== Number(userId));
      return formatOrder(order);
    }
  );

const getOrders = async (userId) =>
  withPrisma(
    async (db) => {
      const orders = await db.order.findMany({
        where: {
          userId: Number(userId),
        },
        include: {
          items: true,
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      return orders.map(formatOrder);
    },
    async () =>
      memory.orders
        .filter((order) => order.userId === Number(userId))
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .map(formatOrder)
  );

const getOrderById = async (userId, orderId) =>
  withPrisma(
    async (db) => {
      const order = await db.order.findFirst({
        where: {
          id: Number(orderId),
          userId: Number(userId),
        },
        include: {
          items: true,
        },
      });

      return order ? formatOrder(order) : null;
    },
    async () => {
      const order = memory.orders.find(
        (item) => item.id === Number(orderId) && item.userId === Number(userId)
      );

      return order ? formatOrder(order) : null;
    }
  );

const getLatestOrder = async (userId) => {
  const orders = await getOrders(userId);
  return orders[0] || null;
};

const getWishlist = async (userId) =>
  withPrisma(
    async (db) => {
      const rows = await db.wishlist.findMany({
        where: {
          userId: Number(userId),
        },
        include: {
          product: true,
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      return rows.map((row) => normalizeProduct(row.product));
    },
    async () =>
      memory.wishlist
        .filter((row) => row.userId === Number(userId))
        .map((row) => getMemoryProduct(row.productId))
        .filter(Boolean)
        .map(normalizeProduct)
  );

const addWishlistItem = async (userId, productId) =>
  withPrisma(
    async (db) => {
      await ensureSeedProducts(db);

      const product = await db.product.findUnique({
        where: {
          id: Number(productId),
        },
      });

      if (!product) {
        throw new ApiError(404, "Product not found.");
      }

      await db.wishlist.upsert({
        where: {
          userId_productId: {
            userId: Number(userId),
            productId: Number(productId),
          },
        },
        update: {},
        create: {
          userId: Number(userId),
          productId: Number(productId),
        },
      });

      return getWishlist(userId);
    },
    async () => {
      const product = getMemoryProduct(productId);

      if (!product) {
        throw new ApiError(404, "Product not found.");
      }

      const existingItem = memory.wishlist.find(
        (item) =>
          item.userId === Number(userId) && item.productId === Number(productId)
      );

      if (!existingItem) {
        memory.wishlist.push({
          id: memory.nextWishlistId,
          userId: Number(userId),
          productId: Number(productId),
          createdAt: now(),
        });

        memory.nextWishlistId += 1;
      }

      return getWishlist(userId);
    }
  );

const removeWishlistItem = async (userId, productId) =>
  withPrisma(
    async (db) => {
      await db.wishlist.deleteMany({
        where: {
          userId: Number(userId),
          productId: Number(productId),
        },
      });

      return getWishlist(userId);
    },
    async () => {
      memory.wishlist = memory.wishlist.filter(
        (item) =>
          item.userId !== Number(userId) || item.productId !== Number(productId)
      );

      return getWishlist(userId);
    }
  );

const createContactMessage = async ({ name, email, message }) =>
  withPrisma(
    async (db) =>
      db.contactMessage.create({
        data: {
          name: name.trim(),
          email: normalizeEmail(email),
          message: message.trim(),
        },
      }),
    async () => {
      const contactMessage = {
        id: memory.nextContactMessageId,
        name: name.trim(),
        email: normalizeEmail(email),
        message: message.trim(),
        createdAt: now(),
      };

      memory.nextContactMessageId += 1;
      memory.contactMessages.push(contactMessage);

      return contactMessage;
    }
  );

// Admin functions
const getAllOrders = async () =>
  withPrisma(
    async (db) => {
      const orders = await db.order.findMany({
        include: {
          items: true,
          user: true,
        },
        orderBy: {
          createdAt: "desc",
        },
      });
      return orders.map(formatOrder);
    },
    async () => {
      return memory.orders.map(formatOrder).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }
  );

const getAllUsers = async () =>
  withPrisma(
    async (db) => {
      const users = await db.user.findMany({
        orderBy: {
          createdAt: "desc",
        },
      });
      return users.map(publicUser);
    },
    async () => memory.users.map(publicUser).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  );

const getAllProducts = async () => getProducts();

const getAllContactMessages = async () =>
  withPrisma(
    async (db) => {
      return await db.contactMessage.findMany({
        orderBy: {
          createdAt: "desc",
        },
      });
    },
    async () => [...memory.contactMessages].reverse()
  );

const formatWishlistEntry = (entry) => ({
  id: entry.id,
  createdAt: entry.createdAt,
  user: publicUser(entry.user),
  product: normalizeProduct(entry.product),
});

const getAllWishlist = async () =>
  withPrisma(
    async (db) => {
      const entries = await db.wishlist.findMany({
        include: {
          user: true,
          product: true,
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      return entries.map(formatWishlistEntry);
    },
    async () =>
      [...memory.wishlist]
        .reverse()
        .map((entry) =>
          formatWishlistEntry({
            ...entry,
            user: memory.users.find((user) => user.id === entry.userId),
            product: getMemoryProduct(entry.productId),
          })
        )
  );

const getAdminStats = async () =>
  withPrisma(
    async (db) => {
      await ensureSeedProducts(db);

      const [totalOrders, totalUsers, totalProducts, orders] = await Promise.all([
        db.order.count(),
        db.user.count(),
        db.product.count(),
        db.order.findMany(),
      ]);

      const totalRevenue = orders.reduce((sum, order) => sum + (order.total || 0), 0);

      return {
        orders: totalOrders,
        users: totalUsers,
        products: totalProducts,
        revenue: totalRevenue,
      };
    },
    async () => {
      const totalOrders = memory.orders.length;
      const totalUsers = memory.users.length;
      const products = memory.products;
      const totalRevenue = memory.orders.reduce((sum, order) => sum + (order.total || 0), 0);

      return {
        orders: totalOrders,
        users: totalUsers,
        products: products.length,
        revenue: totalRevenue,
      };
    }
  );

const withoutGalleryData = (media) => {
  if (!media) {
    return null;
  }

  const { data, ...metadata } = media;
  return metadata;
};

const getGalleryMedia = async () =>
  withPrisma(
    async (db) =>
      db.galleryMedia.findMany({
        select: {
          id: true,
          title: true,
          category: true,
          mediaType: true,
          mimeType: true,
          originalName: true,
          size: true,
          createdAt: true,
          uploadedBy: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      }),
    async () =>
      [...memory.galleryMedia]
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .map(withoutGalleryData)
  );

const getGalleryMediaFile = async (id) =>
  withPrisma(
    async (db) =>
      db.galleryMedia.findUnique({
        where: {
          id: Number(id),
        },
        select: {
          data: true,
          mimeType: true,
          originalName: true,
          size: true,
        },
      }),
    async () => {
      const media = memory.galleryMedia.find((item) => item.id === Number(id));

      if (!media) {
        return null;
      }

      return {
        data: media.data,
        mimeType: media.mimeType,
        originalName: media.originalName,
        size: media.size,
      };
    }
  );

const createGalleryMedia = async (userId, payload) =>
  withPrisma(
    async (db) => {
      const media = await db.galleryMedia.create({
        data: {
          title: payload.title,
          category: payload.category,
          mediaType: payload.mediaType,
          mimeType: payload.mimeType,
          originalName: payload.originalName,
          size: payload.size,
          data: payload.data,
          uploadedById: Number(userId),
        },
        include: {
          uploadedBy: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      return withoutGalleryData(media);
    },
    async () => {
      const media = {
        id: memory.nextGalleryMediaId,
        ...payload,
        uploadedById: Number(userId),
        uploadedBy: publicUser(
          memory.users.find((user) => user.id === Number(userId))
        ),
        createdAt: now(),
      };

      memory.nextGalleryMediaId += 1;
      memory.galleryMedia.push(media);

      return withoutGalleryData(media);
    }
  );

const deleteGalleryMedia = async (id) =>
  withPrisma(
    async (db) => {
      const media = await db.galleryMedia.findUnique({
        where: {
          id: Number(id),
        },
        select: {
          id: true,
          title: true,
        },
      });

      if (!media) {
        return null;
      }

      await db.galleryMedia.delete({
        where: {
          id: Number(id),
        },
      });

      return media;
    },
    async () => {
      const mediaIndex = memory.galleryMedia.findIndex(
        (item) => item.id === Number(id)
      );

      if (mediaIndex === -1) {
        return null;
      }

      const [media] = memory.galleryMedia.splice(mediaIndex, 1);
      return withoutGalleryData(media);
    }
  );

const normalizeProductData = (data, { partial = false } = {}) => {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new ApiError(400, "Product data must be an object.");
  }

  const normalized = {};
  const setText = (field, maxLength, required = false) => {
    if (!partial || Object.hasOwn(data, field)) {
      const value = String(data[field] ?? "").trim();
      if (required && !value) throw new ApiError(400, `${field} is required.`);
      if (value.length > maxLength) {
        throw new ApiError(400, `${field} must not exceed ${maxLength} characters.`);
      }
      normalized[field] = value;
    }
  };

  setText("title", 160, !partial);
  setText("category", 80, !partial);
  setText("description", 10_000);

  if (!partial || Object.hasOwn(data, "price")) {
    const price = Number(data.price);
    if (!Number.isFinite(price) || price <= 0 || price > 1_000_000) {
      throw new ApiError(400, "Price must be greater than 0 and no more than 1,000,000.");
    }
    normalized.price = price;
  }

  if (!partial || Object.hasOwn(data, "images")) {
    const images = data.images ?? [];
    if (!Array.isArray(images) || images.length > 10) {
      throw new ApiError(400, "Images must be an array of at most 10 URLs.");
    }
    normalized.images = images.map((image) => {
      if (typeof image !== "string") {
        throw new ApiError(400, "Each product image must be a URL.");
      }
      const value = image.trim();
      if (
        !value || value.length > 2_000 ||
        !(value.startsWith("/") && !value.startsWith("//")) &&
          !/^https:\/\//i.test(value)
      ) {
        throw new ApiError(400, "Each product image must be a local path or HTTPS URL.");
      }
      return value;
    });
  }

  if (partial && Object.keys(normalized).length === 0) {
    throw new ApiError(400, "No valid product fields were provided.");
  }

  return normalized;
};

const createProduct = async (productData) => {
  const validatedData = normalizeProductData(productData);

  return withPrisma(
    async (db) => {
      // Try to create product, handle unique constraint errors
      try {
        const product = await db.product.create({
          data: validatedData,
        });

        // Update memory.nextProductId to stay in sync with database
        if (product.id >= memory.nextProductId) {
          memory.nextProductId = product.id + 1;
        }

        return normalizeProduct(product);
      } catch (e) {
        // If we hit a unique constraint, try to reset sequence and retry once
        if (e.code === 'P2002') {
          const maxIdResult = await db.product.aggregate({
            _max: { id: true },
          });
          const maxId = maxIdResult._max.id || 0;
          try {
            await db.$queryRaw`SELECT setval(pg_get_serial_sequence('"Product"', 'id'), COALESCE((SELECT MAX(id) FROM "Product"), 1), true)`;
          } catch (seqErr) {
            console.warn("Could not reset product sequence:", seqErr.message);
          }
          memory.nextProductId = maxId + 1;
          // Retry once
          const product = await db.product.create({
            data: validatedData,
          });
          if (product.id >= memory.nextProductId) {
            memory.nextProductId = product.id + 1;
          }
          return normalizeProduct(product);
        }
        throw e;
      }
    },
    async () => {
      const product = {
        id: memory.nextProductId++,
        ...validatedData,
        createdAt: now(),
        updatedAt: now(),
      };

      memory.products.push(product);

      return normalizeProduct(product);
    }
  );
};

const updateProduct = async (id, data) => {
  const productId = Number(id);
  if (!Number.isSafeInteger(productId) || productId < 1) {
    throw new ApiError(400, "Product id must be a positive integer.");
  }
  const updateData = normalizeProductData(data, { partial: true });
  
  return withPrisma(
    async (db) => {
      const existingProduct = await db.product.findUnique({
        where: { id: productId },
      });

      if (!existingProduct) {
        return null;
      }

      const updatedProduct = await db.product.update({
        where: { id: productId },
        data: updateData,
      });

      return normalizeProduct(updatedProduct);
    },
    async () => {
      const productIndex = memory.products.findIndex(p => p.id === productId);
      
      if (productIndex === -1) {
        return null;
      }

      const product = memory.products[productIndex];
      
      Object.assign(product, updateData);
      
      product.updatedAt = now();
      return normalizeProduct(product);
    }
  );
};

const deleteProduct = async (id) => {
  const productId = Number(id);

  return withPrisma(
    async (db) => {
      const product = await db.product.findUnique({
        where: {
          id: productId,
        },
      });

      if (!product) {
        return null;
      }

      // Also clean up related entries
      await Promise.all([
        db.cart.deleteMany({
          where: { productId } }),
        db.wishlist.deleteMany({
          where: { productId } }),
      ]);

      await db.product.delete({
        where: { id: productId },
      });

      return normalizeProduct(product);
    },
    async () => {
      const productIndex = memory.products.findIndex(p => p.id === productId);
      if (productIndex === -1) {
        return null;
      }

      const [deletedProduct] = memory.products.splice(productIndex, 1);

      // Clean up related entries
      memory.carts = memory.carts.filter(c => c.productId !== productId);
      memory.wishlist = memory.wishlist.filter(w => w.productId !== productId);

      return normalizeProduct(deletedProduct);
    }
  );
};

module.exports = {
  addToCart,
  addWishlistItem,
  clearCart,
  createContactMessage,
  createOrder,
  createPendingPaymentOrder,
  setRazorpayOrderId,
  markPaymentSetupFailed,
  getPaymentOrder,
  completePaymentOrder,
  getCart,
  getLatestOrder,
  getOrderById,
  getOrders,
  getProductById,
  getProducts,
  getUserByEmail,
  getUserById,
  getWishlist,
  loginUser,
  publicUser,
  registerUser,
  removeCartItem,
  removeWishlistItem,
  updateCartItem,
  updateUser,
  // Admin exports
  getAllOrders,
  getAllUsers,
  getAllProducts,
  getAllContactMessages,
  getAllWishlist,
  getAdminStats,
  getGalleryMedia,
  getGalleryMediaFile,
  createGalleryMedia,
  deleteGalleryMedia,
  // Product management
  createProduct,
  deleteProduct,
  updateProduct,
};
