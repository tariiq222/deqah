import { PrismaClient } from '@prisma/client';

export async function seedVerticals(prisma: PrismaClient) {
  const verticals = [
    { slug: 'medical', nameAr: 'العيادات الطبية', nameEn: 'Medical Clinics', templateFamily: 'MEDICAL' as const, sortOrder: 10 },
    { slug: 'therapy', nameAr: 'العلاج النفسي والأسري', nameEn: 'Psychology & Family Therapy', templateFamily: 'THERAPY' as const, sortOrder: 20 },
    { slug: 'consulting', nameAr: 'الاستشارات', nameEn: 'Consulting', templateFamily: 'CONSULTING' as const, sortOrder: 30 },
    { slug: 'salon', nameAr: 'الصالونات والعناية', nameEn: 'Salons & Personal Care', templateFamily: 'SALON' as const, sortOrder: 40 },
    { slug: 'fitness', nameAr: 'اللياقة', nameEn: 'Fitness', templateFamily: 'FITNESS' as const, sortOrder: 50 },
  ];
  for (const v of verticals) {
    await prisma.vertical.upsert({
      where: { slug: v.slug },
      create: { ...v, isActive: true },
      update: { nameAr: v.nameAr, nameEn: v.nameEn, templateFamily: v.templateFamily, sortOrder: v.sortOrder, isActive: true },
    });
  }
  console.log(`✔  Verticals seeded: ${verticals.map(v => v.slug).join(', ')}`);
}
