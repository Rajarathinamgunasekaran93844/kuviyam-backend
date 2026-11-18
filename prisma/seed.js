require("dotenv").config({ quiet: true });

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const { createPrismaAdapter } = require("../src/config/prismaAdapter");
const products = require("../src/data/products");

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not configured");
}

if (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD.length < 12) {
  throw new Error("Set ADMIN_PASSWORD to a value with at least 12 characters before seeding.");
}

const prisma = new PrismaClient({
  adapter: createPrismaAdapter(process.env.DATABASE_URL),
});

const main = async () => {
  console.log("Seeding Kuviyam products...");

  for (const product of products) {
    await prisma.product.upsert({
      where: { id: product.id },
      update: {},
      create: {
        id: product.id,
        title: product.title,
        category: product.category,
        price: product.price,
        images: product.images,
        description: product.description,
      },
    });
    console.log(`Seeded product: ${product.title}`);
  }

  await prisma.$queryRaw`SELECT setval(pg_get_serial_sequence('"Product"', 'id'), COALESCE((SELECT MAX(id) FROM "Product"), 1), true)`;

  console.log("\nSeeding admin user...");

  const adminEmail = process.env.ADMIN_EMAIL || "admin@paachcharam.com";
  const adminPassword = process.env.ADMIN_PASSWORD;
  const hashedPassword = await bcrypt.hash(adminPassword, 12);

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: { isAdmin: true },
    create: {
      name: "Admin User",
      email: adminEmail,
      phone: "9876543210",
      address: "Chennai, Tamil Nadu",
      password: hashedPassword,
      isAdmin: true,
    },
  });

  console.log("Admin user seeded.");

  console.log("\nAll seeding completed successfully.");
};

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error("Seeding error:", error);
    await prisma.$disconnect();
    process.exit(1);
  });
