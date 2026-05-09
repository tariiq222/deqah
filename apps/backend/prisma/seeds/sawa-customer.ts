/**
 * One-time idempotent seed: relabel the dev DEFAULT_ORGANIZATION as
 * "سواء للإرشاد الأسري" and link it to the therapy vertical.
 *
 * Run:  npm run seed:sawa --workspace=backend
 * Safe to re-run.
 */

import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const DEFAULT_ORG_ID = '00000000-0000-0000-0000-000000000001';

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });
  await prisma.$connect();

  const vertical = await prisma.vertical.findUnique({
    where: { slug: 'therapy' },
  });
  if (!vertical) {
    throw new Error(
      'Vertical "therapy" not found. Run base seeds first (npm run seed).',
    );
  }

  const updated = await prisma.organization.update({
    where: { id: DEFAULT_ORG_ID },
    data: {
      nameAr: 'سواء للإرشاد الأسري',
      nameEn: 'Sawa Family Counseling',
      slug: 'sawa',
      verticalId: vertical.id,
    },
  });

  console.log('✓ Updated organization:', {
    id: updated.id,
    nameAr: updated.nameAr,
    slug: updated.slug,
    verticalId: updated.verticalId,
  });

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
