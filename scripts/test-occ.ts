import { ConflictException } from '@nestjs/common';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config.js';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function deductConcurrently() {
  const product = await prisma.product.findFirstOrThrow({
    where: { stock: { gte: 2 } },
  });
  console.log(
    `Product ${product.id}: stock=${product.stock} version=${product.version}`,
  );

  const attempt = async (label: string) => {
    try {
      await prisma.$transaction(async (tx) => {
        // BOTH read the same version
        const p = await tx.product.findUniqueOrThrow({
          where: { id: product.id },
        });
        await delay(300); // force overlap so both hold version=p.version
        const r = await tx.product.updateMany({
          where: { id: p.id, version: p.version, stock: { gte: 1 } },
          data: { stock: { decrement: 1 }, version: { increment: 1 } },
        });
        console.log(`[${label}] updated ${r.count} row(s)`);
        if (r.count == 0) throw new ConflictException('conflict');
      });
      console.log(`[${label}] COMMITTED`);
    } catch (e: any) {
      console.log(`[${label}] FAILED -> ${e.message}`);
    }
  };

  await Promise.all([attempt('tx-A'), attempt('tx-B'), attempt('tx-C')]);
  const after = await prisma.product.findUniqueOrThrow({
    where: { id: product.id },
  });
  console.log(`After: stock=${after.stock} version=${after.version}`);
}

deductConcurrently().finally(() => prisma.$disconnect());
