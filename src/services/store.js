const bcrypt = require("bcryptjs");

const seedProducts = require("../data/products");
const { withPrisma } = require("../config/prisma");
const ApiError = require("../utils/ApiError");
const { requireFields } = require("../utils/validators");

const now = () => new Date().toISOString();

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

  const bcryptMatch = await bcrypt
    .compare(plainPassword, storedPassword)
    .catch(() => false);

  return bcryptMatch || plainPassword === storedPassword;
};

const productWriteData = (product) => ({
  title: product.title,
  category: product.category,
  price: product.price,
  images: product.images,
  description: product.description,
});

const ensureSeedProducts = async (db) => {
  for (const product of seedProducts) {
    await db.product.upsert({
      where: {
        id: product.id,
      },
      update: productWriteData(product),
      create: {
        id: product.id,
        ...productWriteData(product),
      },
    });
  }

  // Get the highest product ID from database and update memory.nextProductId
  const maxIdResult = await db.product.aggregate({
    _max: {
      id: true,
    },
  });
  const maxId = maxIdResult._max.id || seedProducts.length;
  // Reset the auto-increment sequence for PostgreSQL to avoid unique constraint errors
  try {
    await db.$executeRawUnsafe(`ALTER SEQUENCE "Product_id_seq" RESTART WITH ${maxId + 1};`);
  } catch (e) {
    console.warn("Could not reset product sequence:", e.message);
  }
  memory.nextProductId = maxId + 1;
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
  const source = normalizeProduct(product || incomingItem);
  const quantity = Math.max(1, Number.parseInt(incomingItem.quantity, 10) || 1);
  const price = Number(source?.price ?? incomingItem.price ?? 0);
  const productImage = source?.images?.[0] || null;
  const lineTotal = price * quantity;

  return {
    productId: product?.id || null,
    productTitle: source?.title || incomingItem.title || "Book",
    productCategory: source?.category || incomingItem.category || null,
    productImage,
    quantity,
    price,
    lineTotal,
    responseItem: {
      id: product?.id || incomingItem.id || incomingItem.productId,
      title: source?.title || incomingItem.title || "Book",
      category: source?.category || incomingItem.category || null,
      price,
      images: source?.images || [],
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
  const passwordHash = await bcrypt.hash(password, 10);

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

      return publicUser(user);
    },
    async () => {
      const user = memory.users.find((item) => item.email === normalizedEmail);

      if (!user || !(await comparePassword(password, user.password))) {
        throw new ApiError(401, "Invalid email or password.");
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
    updateData.password = await bcrypt.hash(payload.password, 10);
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

const addToCart = async (userId, payload) => {
  const productId = Number(payload.productId || payload.product?.id || payload.id);
  const quantity = Math.max(1, Number.parseInt(payload.quantity, 10) || 1);

  if (!productId) {
    throw new ApiError(400, "Product id is required.");
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

      await db.cart.upsert({
        where: {
          userId_productId: {
            userId: Number(userId),
            productId,
          },
        },
        update: {
          quantity: {
            increment: quantity,
          },
        },
        create: {
          userId: Number(userId),
          productId,
          quantity,
        },
      });

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
  const nextQuantity = Math.max(1, Number.parseInt(quantity, 10) || 1);
  const parsedProductId = Number(productId);

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

const createOrder = async (userId, payload) => {
  const customer = payload.customer || {};
  const incomingItems = Array.isArray(payload.items) ? payload.items : [];

  if (incomingItems.length === 0) {
    throw new ApiError(400, "Order must contain at least one item.");
  }

  return withPrisma(
    async (db) => {
      await ensureSeedProducts(db);

      const orderItems = [];

      for (const item of incomingItems) {
        const productId = Number(item.productId || item.id);
        const product = productId
          ? await db.product.findUnique({
              where: {
                id: productId,
              },
            })
          : null;

        orderItems.push(buildOrderItem(item, product));
      }

      const total = orderItems.reduce((sum, item) => sum + item.lineTotal, 0);

      const order = await db.order.create({
        data: {
          userId: Number(userId),
          total,
          status: "PLACED",
          paymentMethod: payload.paymentMethod || "COD",
          customerName: customer.name.trim(),
          customerPhone: customer.phone.trim(),
          customerAddress: customer.address.trim(),
          items: {
            create: orderItems.map((item) => ({
              quantity: item.quantity,
              price: item.price,
              lineTotal: item.lineTotal,
              productTitle: item.productTitle,
              productCategory: item.productCategory,
              productImage: item.productImage,
              productId: item.productId,
            })),
          },
        },
        include: {
          items: true,
        },
      });

      await db.cart.deleteMany({
        where: {
          userId: Number(userId),
        },
      });

      return formatOrder(order);
    },
    async () => {
      const orderItems = incomingItems.map((item) => {
        const product = getMemoryProduct(item.productId || item.id);
        return buildOrderItem(item, product);
      });

      const total = orderItems.reduce((sum, item) => sum + item.lineTotal, 0);

      const order = {
        id: memory.nextOrderId,
        customerName: customer.name.trim(),
        customerPhone: customer.phone.trim(),
        customerAddress: customer.address.trim(),
        total,
        status: "PLACED",
        paymentMethod: payload.paymentMethod || "COD",
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
      memory.carts = memory.carts.filter((item) => item.userId !== Number(userId));

      return formatOrder(order);
    }
  );
};

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

const createProduct = async (productData) => {
  const createProductInternal = (data) => {
    // Validate data
    requireFields(data, ['title', 'category', 'price']);

    return {
      title: data.title.trim(),
      category: data.category.trim(),
      price: Number(data.price),
      images: data.images || [],
      description: data.description || '',
    };
  };

  const validatedData = createProductInternal(productData);

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
            await db.$executeRawUnsafe(`ALTER SEQUENCE "Product_id_seq" RESTART WITH ${maxId + 1};`);
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
  
  return withPrisma(
    async (db) => {
      const existingProduct = await db.product.findUnique({
        where: { id: productId },
      });

      if (!existingProduct) {
        return null;
      }

      const updateData = {};
      
      if (data.title !== undefined) {
        updateData.title = data.title;
      }
      if (data.category !== undefined) {
        updateData.category = data.category;
      }
      if (data.price !== undefined) {
        updateData.price = Number(data.price);
      }
      if (data.description !== undefined) {
        updateData.description = data.description;
      }
      if (data.images !== undefined) {
        updateData.images = data.images;
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
      
      if (data.title !== undefined) {
        product.title = data.title;
      }
      if (data.category !== undefined) {
        product.category = data.category;
      }
      if (data.price !== undefined) {
        product.price = Number(data.price);
      }
      if (data.description !== undefined) {
        product.description = data.description;
      }
      if (data.images !== undefined) {
        product.images = data.images;
      }
      
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
