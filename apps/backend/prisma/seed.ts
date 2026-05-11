/**
 * Dev seed — creates an ADMIN user + singleton configs + main branch.
 * Run:  npm run prisma:seed
 * Safe to re-run: uses upsert everywhere.
 */

import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { seedVerticals } from './seeds/verticals';

const ADMIN_EMAIL    = process.env.SEED_EMAIL    ?? 'admin@deqah-test.com';
const ADMIN_PASSWORD = process.env.SEED_PASSWORD ?? 'Admin@1234';
const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL;
const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD;
const DEFAULT_ORG_ID = '00000000-0000-0000-0000-000000000001';

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('prisma db seed must not run in production');
  }
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });
  await prisma.$connect();

  // 0. Cleanup isolation test artifacts (Bug #24)
  await prisma.user.deleteMany({
    where: {
      OR: [
        { email: { contains: '@t.test' } },
        { email: { startsWith: 'iso-' } },
      ],
    },
  });

  // 1. Admin user (email is globally @unique now)
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  const adminUser = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    create: {
      email: ADMIN_EMAIL,
      passwordHash,
      name: 'Admin',
      role: 'ADMIN',
      isActive: true,
    },
    update: {},
  });

  // 1.1 Admin membership to the default org — login requires an active
  //     Membership since SaaS-05b. @@unique([userId]) lets us upsert on userId.
  await prisma.membership.upsert({
    where: { userId_organizationId: { userId: adminUser.id, organizationId: DEFAULT_ORG_ID } },
    create: {
      userId: adminUser.id,
      organizationId: DEFAULT_ORG_ID,
      role: 'OWNER',
      isActive: true,
      acceptedAt: new Date(),
    },
    update: {
      role: 'OWNER',
      isActive: true,
    },
  });

  if (!SUPER_ADMIN_EMAIL || !SUPER_ADMIN_PASSWORD) {
    throw new Error('SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD are required to seed the initial super-admin user');
  }

  const superAdminPasswordHash = await bcrypt.hash(SUPER_ADMIN_PASSWORD, 10);
  await prisma.user.upsert({
    where: { email: SUPER_ADMIN_EMAIL },
    create: {
      email: SUPER_ADMIN_EMAIL,
      passwordHash: superAdminPasswordHash,
      name: 'Platform Admin',
      role: 'SUPER_ADMIN',
      isSuperAdmin: true,
      isActive: true,
    },
    update: {
      passwordHash: superAdminPasswordHash,
      role: 'SUPER_ADMIN',
      isSuperAdmin: true,
      isActive: true,
    },
  });

  // 1.5 Default org — clear any leftover suspension state from SaaS-05b tests.
  //     `updateMany` is a no-op if the row is missing, safe for fresh DBs.
  await prisma.organization.updateMany({
    where: { id: DEFAULT_ORG_ID, suspendedAt: { not: null } },
    data: { suspendedAt: null, suspendedReason: null, status: 'ACTIVE' },
  });

  // 2. Branding singleton (org-unique per SaaS-02c)
  await prisma.brandingConfig.upsert({
    where: { organizationId: DEFAULT_ORG_ID },
    create: {
      organizationId: DEFAULT_ORG_ID,
      organizationNameAr: 'منظمتي',
      organizationNameEn: 'My Organization',
      colorPrimary: '#354FD8',
      colorAccent:  '#82CC17',
    },
    update: {},
  });

  // 3. Organization settings singleton (org-unique per SaaS-02c)
  await prisma.organizationSettings.upsert({
    where: { organizationId: DEFAULT_ORG_ID },
    create: { organizationId: DEFAULT_ORG_ID },
    update: {},
  });

  // 4. Main branch
  const DEFAULT_BRANCH_ID = 'c1b2c3d4-e5f6-4a5b-8c9d-e0f1a2b3c4d5';
  await prisma.branch.upsert({
    where: { id: DEFAULT_BRANCH_ID },
    create: {
      id:       DEFAULT_BRANCH_ID,
      organizationId: DEFAULT_ORG_ID,
      nameAr:   'الفرع الرئيسي',
      nameEn:   'Main Branch',
      isActive: true,
      isMain:   true,
      timezone: 'Asia/Riyadh',
      country:  'SA',
    },
    update: {},
  });

  // 5. Business hours for the main branch (Sun–Thu 09:00–17:00 open, Fri/Sat closed).
  // Required so dev create-booking flow can find available slots.
  for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
    const isWeekend = dayOfWeek === 5 || dayOfWeek === 6; // Fri, Sat
    await prisma.businessHour.upsert({
      where: { branchId_dayOfWeek: { branchId: DEFAULT_BRANCH_ID, dayOfWeek } },
      create: {
        organizationId: DEFAULT_ORG_ID,
        branchId:       DEFAULT_BRANCH_ID,
        dayOfWeek,
        startTime:      '09:00',
        endTime:        '17:00',
        isOpen:         !isWeekend,
      },
      update: {},
    });
  }

  // 5.5. Canonical verticals
  await seedVerticals(prisma);

  // 6. Email templates — one row per slug the backend sends.
  //    Free-form: owners rewrite name/subject/body in any language they want.
  const layout = (heading: string, bodyHtml: string) => `<div style="font-family: 'IBM Plex Sans Arabic', system-ui, sans-serif; padding: 24px; max-width: 560px; direction: rtl;">
  <h2 style="color: #354FD8; margin: 0 0 16px;">${heading}</h2>
  ${bodyHtml}
</div>`;

  const button = (href: string, label: string) =>
    `<p style="margin: 24px 0;"><a href="${href}" style="background:#354FD8;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;">${label}</a></p>`;

  const TEMPLATES: Array<{ slug: string; name: string; subject: string; htmlBody: string }> = [
    {
      slug: 'user_password_reset',
      name: 'إعادة تعيين كلمة المرور',
      subject: 'إعادة تعيين كلمة المرور — Deqah',
      htmlBody: layout(
        'إعادة تعيين كلمة المرور',
        `<p>مرحباً {{userName}}،</p>
  <p>وصلنا طلب لإعادة تعيين كلمة مرورك في Deqah. اضغط الزر بالأسفل لتعيين كلمة جديدة. الرابط صالح لمدة 30 دقيقة.</p>
  ${button('{{resetUrl}}', 'إعادة تعيين كلمة المرور')}
  <p style="color:#6b7280;font-size:14px;">إذا لم تطلب هذا، يمكنك تجاهل الرسالة بأمان.</p>`,
      ),
    },
    {
      slug: 'user_email_verification',
      name: 'تأكيد البريد الإلكتروني',
      subject: 'تأكيد بريدك الإلكتروني — Deqah',
      htmlBody: layout(
        'تأكيد البريد الإلكتروني',
        `<p>مرحباً {{userName}}،</p>
  <p>اضغط الزر بالأسفل لتأكيد بريدك الإلكتروني وتفعيل حسابك في Deqah.</p>
  ${button('{{verifyUrl}}', 'تأكيد البريد')}
  <p style="color:#6b7280;font-size:14px;">إذا لم تنشئ هذا الحساب، يمكنك تجاهل الرسالة.</p>`,
      ),
    },
    {
      slug: 'welcome',
      name: 'رسالة ترحيب',
      subject: 'أهلاً بك في Deqah',
      htmlBody: layout(
        'أهلاً بك',
        `<p>مرحباً {{client_name}}،</p>
  <p>سعداء بانضمامك إلينا. حسابك جاهز الآن، ويمكنك حجز موعدك الأول في أي وقت.</p>`,
      ),
    },
    {
      slug: 'booking-cancelled',
      name: 'إلغاء حجز',
      subject: 'تم إلغاء حجزك',
      htmlBody: layout(
        'تم إلغاء حجزك',
        `<p>مرحباً {{client_name}}،</p>
  <p>نأسف لإبلاغك بأنه تم إلغاء حجزك رقم <strong>{{booking_id}}</strong>.</p>
  <p>السبب: {{reason}}</p>
  <p>يمكنك إعادة الحجز في أي وقت من تطبيق Deqah.</p>`,
      ),
    },
    {
      slug: 'payment-failed',
      name: 'فشل عملية دفع',
      subject: 'تعذّر إتمام الدفع',
      htmlBody: layout(
        'تعذّر إتمام الدفع',
        `<p>مرحباً {{client_name}}،</p>
  <p>لم نتمكن من معالجة دفعتك بقيمة <strong>{{amount}} {{currency}}</strong>.</p>
  <p>يرجى التحقق من بيانات بطاقتك أو تجربة وسيلة دفع أخرى.</p>`,
      ),
    },
  ];

  for (const tmpl of TEMPLATES) {
    await prisma.emailTemplate.upsert({
      where: { organizationId_slug: { organizationId: DEFAULT_ORG_ID, slug: tmpl.slug } },
      update: {},
      create: {
        organizationId: DEFAULT_ORG_ID,
        slug: tmpl.slug,
        name: tmpl.name,
        subject: tmpl.subject,
        htmlBody: tmpl.htmlBody,
        isActive: true,
      },
    });
  }

  await prisma.$disconnect();

  console.log('─────────────────────────────────────────────');
  console.log(`✔  Admin  : ${ADMIN_EMAIL}`);
  console.log(`✔  Super admin: ${SUPER_ADMIN_EMAIL}`);
  console.log(`✔  Branding singleton ready`);
  console.log(`✔  OrganizationSettings singleton ready`);
  console.log(`✔  Main branch created`);
  console.log(`✔  BusinessHours seeded (Sun–Thu 09:00–17:00, Fri/Sat closed)`);
  console.log(`✔  Email templates upserted: ${TEMPLATES.map(t => t.slug).join(', ')}`);
  console.log('─────────────────────────────────────────────');
}

main().catch((e) => { console.error(e); process.exit(1); });
