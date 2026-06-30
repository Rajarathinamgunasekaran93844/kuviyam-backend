require("dotenv").config({ quiet: true });

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const { createPrismaAdapter } = require("../src/config/prismaAdapter");
const products = require("../src/data/products");

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not configured");
}

const prisma = new PrismaClient({
  adapter: createPrismaAdapter(process.env.DATABASE_URL),
});

const main = async () => {
  console.log("Seeding Kuviyam products...");

  for (const product of products) {
    await prisma.product.upsert({
      where: { id: product.id },
      update: {
        title: product.title,
        category: product.category,
        price: product.price,
        images: product.images,
        description: product.description,
      },
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

  console.log("\nSeeding admin user...");

  const adminEmail = process.env.ADMIN_EMAIL || "admin@paachcharam.com";
  const adminPassword = process.env.ADMIN_PASSWORD || "admin123";
  const hashedPassword = await bcrypt.hash(adminPassword, 10);

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
  if (!process.env.ADMIN_PASSWORD) {
    console.log("ADMIN_PASSWORD is not set; the default seed password was used.");
  }

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
