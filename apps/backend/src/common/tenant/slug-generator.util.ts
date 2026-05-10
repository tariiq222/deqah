export const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])?$/;
export const SLUG_MIN_LEN = 3;
export const SLUG_MAX_LEN = 30;

/**
 * Map of common Arabic letters to a Latin approximation. Not a linguistic
 * transliteration scheme — its only goal is to produce something a human can
 * recognize for a generated default slug. Operators always have the option to
 * override the auto-generated value in the wizard.
 */
const AR_TO_LATIN: Record<string, string> = {
  'ا': 'a', 'أ': 'a', 'إ': 'a', 'آ': 'a', 'ى': 'a',
  'ب': 'b', 'ت': 't', 'ث': 'th',
  'ج': 'j', 'ح': 'h', 'خ': 'kh',
  'د': 'd', 'ذ': 'dh',
  'ر': 'r', 'ز': 'z',
  'س': 's', 'ش': 'sh',
  'ص': 's', 'ض': 'd',
  'ط': 't', 'ظ': 'z',
  'ع': 'a', 'غ': 'gh',
  'ف': 'f', 'ق': 'q',
  'ك': 'k', 'ل': 'l',
  'م': 'm', 'ن': 'n',
  'ه': 'h', 'ة': 'h',
  'و': 'w', 'ؤ': 'w',
  'ي': 'y', 'ئ': 'y',
  'ء': '',
};

function transliterateArabic(input: string): string {
  let out = '';
  for (const ch of input) {
    out += AR_TO_LATIN[ch] ?? ch;
  }
  return out;
}

/**
 * Produce a subdomain-safe slug from any human-supplied name. Always returns a
 * value that matches SLUG_REGEX; collision handling is the caller's job.
 */
export function generateSubdomainSafeSlug(input: string): string {
  const transliterated = transliterateArabic(input ?? '');
  let slug = transliterated
    .toLowerCase()
    .replace(/[\s_]+/g, '-')        // whitespace + underscores → hyphen
    .replace(/[^a-z0-9-]/g, '')     // strip everything outside [a-z0-9-]
    .replace(/-{2,}/g, '-')         // collapse consecutive hyphens
    .replace(/^-+|-+$/g, '');       // trim leading/trailing hyphens

  if (slug.length === 0) slug = 'org';

  if (slug.length > SLUG_MAX_LEN) {
    slug = slug.slice(0, SLUG_MAX_LEN).replace(/-+$/g, '');
  }

  if (slug.length < SLUG_MIN_LEN) {
    slug = (slug + 'org').slice(0, SLUG_MIN_LEN);
  }

  // Final regex guarantee — if anything slipped through, fall back.
  return SLUG_REGEX.test(slug) ? slug : 'org';
}
