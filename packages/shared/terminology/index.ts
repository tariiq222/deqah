// Terminology packs drive vertical-aware wording across dashboard and website.
// Each key has both Arabic and English values. The base pack is the template
// family's pack; a Vertical may override individual keys via
// VerticalTerminologyOverride rows in the DB.
//
// The per-family packs were previously JSON files. They were inlined here so
// the package loads cleanly on Node 22+ without JSON import attributes — Node
// native TS stripping runs via ESM, which rejects .json imports without
// `with { type: 'json' }`, and that syntax is in turn rejected by
// TypeScript's `module: commonjs` output used by the backend. Inlining
// sidesteps both constraints — pure TS, no JSON, no attributes.

export const TEMPLATE_FAMILIES = ['MEDICAL', 'THERAPY', 'CONSULTING', 'SALON', 'FITNESS'] as const;
export type TemplateFamily = (typeof TEMPLATE_FAMILIES)[number];

export const TERMINOLOGY_KEYS = [
  'employee.singular',
  'employee.plural',
  'employee.possessive',
  'service.singular',
  'service.plural',
  'client.singular',
  'client.plural',
  'booking.singular',
  'booking.plural',
  'appointment.singular',
  'appointment.plural',
  'department.singular',
  'department.plural',
  'category.singular',
  'category.plural',
  'branch.singular',
  'branch.plural',
  'session.singular',
  'session.plural',
] as const;

export type TerminologyKey = (typeof TERMINOLOGY_KEYS)[number];

export interface TerminologyValue {
  ar: string;
  en: string;
}

export type TerminologyPack = Record<TerminologyKey, TerminologyValue>;

const medical: TerminologyPack = {
  'employee.singular': { ar: 'طبيب', en: 'Doctor' },
  'employee.plural': { ar: 'الأطباء', en: 'Doctors' },
  'employee.possessive': { ar: 'طبيبك', en: 'your doctor' },
  'service.singular': { ar: 'خدمة', en: 'Service' },
  'service.plural': { ar: 'الخدمات', en: 'Services' },
  'client.singular': { ar: 'مستفيد', en: 'Beneficiary' },
  'client.plural': { ar: 'المستفيدون', en: 'Beneficiaries' },
  'booking.singular': { ar: 'حجز', en: 'Booking' },
  'booking.plural': { ar: 'الحجوزات', en: 'Bookings' },
  'appointment.singular': { ar: 'موعد', en: 'Appointment' },
  'appointment.plural': { ar: 'المواعيد', en: 'Appointments' },
  'department.singular': { ar: 'قسم', en: 'Department' },
  'department.plural': { ar: 'الأقسام', en: 'Departments' },
  'category.singular': { ar: 'فئة', en: 'Category' },
  'category.plural': { ar: 'الفئات', en: 'Categories' },
  'branch.singular': { ar: 'فرع', en: 'Branch' },
  'branch.plural': { ar: 'الفروع', en: 'Branches' },
  'session.singular': { ar: 'جلسة', en: 'Session' },
  'session.plural': { ar: 'الجلسات', en: 'Sessions' },
};

const therapy: TerminologyPack = {
  'employee.singular': { ar: 'معالج', en: 'Therapist' },
  'employee.plural': { ar: 'المعالجون', en: 'Therapists' },
  'employee.possessive': { ar: 'معالجك', en: 'your therapist' },
  'service.singular': { ar: 'جلسة', en: 'Session' },
  'service.plural': { ar: 'الجلسات', en: 'Sessions' },
  'client.singular': { ar: 'مراجع', en: 'Client' },
  'client.plural': { ar: 'المراجعون', en: 'Clients' },
  'booking.singular': { ar: 'حجز', en: 'Booking' },
  'booking.plural': { ar: 'الحجوزات', en: 'Bookings' },
  'appointment.singular': { ar: 'موعد', en: 'Appointment' },
  'appointment.plural': { ar: 'المواعيد', en: 'Appointments' },
  'department.singular': { ar: 'قسم', en: 'Department' },
  'department.plural': { ar: 'الأقسام', en: 'Departments' },
  'category.singular': { ar: 'مجال', en: 'Area' },
  'category.plural': { ar: 'المجالات', en: 'Areas' },
  'branch.singular': { ar: 'مركز', en: 'Center' },
  'branch.plural': { ar: 'المراكز', en: 'Centers' },
  'session.singular': { ar: 'جلسة', en: 'Session' },
  'session.plural': { ar: 'الجلسات', en: 'Sessions' },
};

const consulting: TerminologyPack = {
  'employee.singular': { ar: 'مستشار', en: 'Consultant' },
  'employee.plural': { ar: 'المستشارون', en: 'Consultants' },
  'employee.possessive': { ar: 'مستشارك', en: 'your consultant' },
  'service.singular': { ar: 'استشارة', en: 'Consultation' },
  'service.plural': { ar: 'الاستشارات', en: 'Consultations' },
  'client.singular': { ar: 'عميل', en: 'Client' },
  'client.plural': { ar: 'العملاء', en: 'Clients' },
  'booking.singular': { ar: 'حجز', en: 'Booking' },
  'booking.plural': { ar: 'الحجوزات', en: 'Bookings' },
  'appointment.singular': { ar: 'موعد', en: 'Appointment' },
  'appointment.plural': { ar: 'المواعيد', en: 'Appointments' },
  'department.singular': { ar: 'قسم', en: 'Department' },
  'department.plural': { ar: 'الأقسام', en: 'Departments' },
  'category.singular': { ar: 'مجال', en: 'Area' },
  'category.plural': { ar: 'المجالات', en: 'Areas' },
  'branch.singular': { ar: 'مكتب', en: 'Office' },
  'branch.plural': { ar: 'المكاتب', en: 'Offices' },
  'session.singular': { ar: 'جلسة', en: 'Session' },
  'session.plural': { ar: 'الجلسات', en: 'Sessions' },
};

const salon: TerminologyPack = {
  'employee.singular': { ar: 'مصفف', en: 'Stylist' },
  'employee.plural': { ar: 'المصففون', en: 'Stylists' },
  'employee.possessive': { ar: 'مصففك', en: 'your stylist' },
  'service.singular': { ar: 'خدمة', en: 'Service' },
  'service.plural': { ar: 'الخدمات', en: 'Services' },
  'client.singular': { ar: 'عميل', en: 'Client' },
  'client.plural': { ar: 'العملاء', en: 'Clients' },
  'booking.singular': { ar: 'حجز', en: 'Booking' },
  'booking.plural': { ar: 'الحجوزات', en: 'Bookings' },
  'appointment.singular': { ar: 'موعد', en: 'Appointment' },
  'appointment.plural': { ar: 'المواعيد', en: 'Appointments' },
  'department.singular': { ar: 'قسم', en: 'Section' },
  'department.plural': { ar: 'الأقسام', en: 'Sections' },
  'category.singular': { ar: 'فئة', en: 'Category' },
  'category.plural': { ar: 'الفئات', en: 'Categories' },
  'branch.singular': { ar: 'فرع', en: 'Location' },
  'branch.plural': { ar: 'الفروع', en: 'Locations' },
  'session.singular': { ar: 'جلسة', en: 'Session' },
  'session.plural': { ar: 'الجلسات', en: 'Sessions' },
};

const fitness: TerminologyPack = {
  'employee.singular': { ar: 'مدرب', en: 'Trainer' },
  'employee.plural': { ar: 'المدربون', en: 'Trainers' },
  'employee.possessive': { ar: 'مدربك', en: 'your trainer' },
  'service.singular': { ar: 'برنامج', en: 'Program' },
  'service.plural': { ar: 'البرامج', en: 'Programs' },
  'client.singular': { ar: 'متدرب', en: 'Member' },
  'client.plural': { ar: 'المتدربون', en: 'Members' },
  'booking.singular': { ar: 'حجز', en: 'Booking' },
  'booking.plural': { ar: 'الحجوزات', en: 'Bookings' },
  'appointment.singular': { ar: 'موعد', en: 'Session' },
  'appointment.plural': { ar: 'المواعيد', en: 'Sessions' },
  'department.singular': { ar: 'قسم', en: 'Division' },
  'department.plural': { ar: 'الأقسام', en: 'Divisions' },
  'category.singular': { ar: 'فئة', en: 'Category' },
  'category.plural': { ar: 'الفئات', en: 'Categories' },
  'branch.singular': { ar: 'فرع', en: 'Gym' },
  'branch.plural': { ar: 'الفروع', en: 'Gyms' },
  'session.singular': { ar: 'حصة', en: 'Class' },
  'session.plural': { ar: 'الحصص', en: 'Classes' },
};

export const BASE_PACKS: Record<TemplateFamily, TerminologyPack> = {
  MEDICAL: medical,
  THERAPY: therapy,
  CONSULTING: consulting,
  SALON: salon,
  FITNESS: fitness,
};

export function mergeOverrides(
  base: TerminologyPack,
  overrides: Array<{ tokenKey: string; valueAr: string; valueEn: string }>,
): TerminologyPack {
  const out: TerminologyPack = { ...base };
  for (const o of overrides) {
    if ((TERMINOLOGY_KEYS as readonly string[]).includes(o.tokenKey)) {
      out[o.tokenKey as TerminologyKey] = { ar: o.valueAr, en: o.valueEn };
    }
  }
  return out;
}
