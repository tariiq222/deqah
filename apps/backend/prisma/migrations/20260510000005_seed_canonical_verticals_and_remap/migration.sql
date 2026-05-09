-- Insert the 5 canonical verticals (idempotent)
INSERT INTO "Vertical" (id, slug, "nameAr", "nameEn", "templateFamily", "sortOrder", "isActive", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid(), 'medical', 'العيادات الطبية', 'Medical Clinics', 'MEDICAL', 10, true, NOW(), NOW()),
  (gen_random_uuid(), 'therapy', 'العلاج النفسي والأسري', 'Psychology & Family Therapy', 'THERAPY', 20, true, NOW(), NOW()),
  (gen_random_uuid(), 'consulting', 'الاستشارات', 'Consulting', 'CONSULTING', 30, true, NOW(), NOW()),
  (gen_random_uuid(), 'salon', 'الصالونات والعناية', 'Salons & Personal Care', 'SALON', 40, true, NOW(), NOW()),
  (gen_random_uuid(), 'fitness', 'اللياقة', 'Fitness', 'FITNESS', 50, true, NOW(), NOW())
ON CONFLICT (slug) DO NOTHING;

-- Re-point organizations from old verticals to new canonical ones
UPDATE "Organization" SET "verticalId" = (SELECT id FROM "Vertical" WHERE slug = 'medical')
  WHERE "verticalId" IN (SELECT id FROM "Vertical" WHERE slug IN ('dental','cosmetic','dermatology','physiotherapy'));

UPDATE "Organization" SET "verticalId" = (SELECT id FROM "Vertical" WHERE slug = 'therapy')
  WHERE "verticalId" IN (SELECT id FROM "Vertical" WHERE slug IN ('family-consulting','psychology'));

UPDATE "Organization" SET "verticalId" = (SELECT id FROM "Vertical" WHERE slug = 'consulting')
  WHERE "verticalId" IN (SELECT id FROM "Vertical" WHERE slug IN ('nutrition'));

UPDATE "Organization" SET "verticalId" = (SELECT id FROM "Vertical" WHERE slug = 'salon')
  WHERE "verticalId" IN (SELECT id FROM "Vertical" WHERE slug IN ('barbershop','beauty-salon','spa','nails'));

-- Delete the 11 old verticals (cascades to seed children + terminology overrides)
DELETE FROM "Vertical" WHERE slug IN (
  'dental','cosmetic','dermatology','physiotherapy',
  'family-consulting','psychology','nutrition',
  'barbershop','beauty-salon','spa','nails'
);
