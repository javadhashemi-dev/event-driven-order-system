import { createPrismaClient } from '../src/lib/prisma.js';

const prisma = createPrismaClient();

async function main() {
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.product.deleteMany();

  const products = await Promise.all([
    prisma.product.create({
      data: {
        sku: 'MACBOOK-PRO-16',
        name: 'MacBook Pro 16" M3 Max',
        price: 3499.0,
        stock: 50,
      },
    }),

    prisma.product.create({
      data: {
        sku: 'SONY-WH1000XM5',
        name: 'Sony WH-1000XM5 Wireless Headphones',
        price: 399.99,
        stock: 100,
      },
    }),

    prisma.product.create({
      data: {
        sku: 'IPHONE-15-PRO',
        name: 'iPhone 15 Pro 256GB',
        price: 1099.0,
        stock: 5,
      },
    }),
  ]);

  console.log(`✅ Seed complete:, ${products.length}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
