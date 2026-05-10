import {
  generateSubdomainSafeSlug,
  SLUG_REGEX,
  SLUG_MIN_LEN,
  SLUG_MAX_LEN,
} from './slug-generator.util';

describe('generateSubdomainSafeSlug', () => {
  it('exposes the canonical regex', () => {
    expect(SLUG_REGEX.source).toBe('^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])?$');
    expect(SLUG_MIN_LEN).toBe(3);
    expect(SLUG_MAX_LEN).toBe(30);
  });

  it('lowercases ASCII names', () => {
    expect(generateSubdomainSafeSlug('Sawa Clinic')).toBe('sawa-clinic');
  });

  it('replaces spaces with single hyphens and collapses repeats', () => {
    expect(generateSubdomainSafeSlug('  Sawa   Clinic  ')).toBe('sawa-clinic');
  });

  it('strips characters outside [a-z0-9-]', () => {
    expect(generateSubdomainSafeSlug('Sawa! Clinic@2025')).toBe('sawa-clinic2025');
  });

  it('transliterates basic Arabic letters to ASCII', () => {
    // عيادة سواء  → ayadt-swa (deterministic mapping; we don't promise linguistic perfection)
    expect(generateSubdomainSafeSlug('عيادة سواء')).toMatch(SLUG_REGEX);
  });

  it('truncates to SLUG_MAX_LEN', () => {
    const long = 'a'.repeat(60);
    const out = generateSubdomainSafeSlug(long);
    expect(out.length).toBeLessThanOrEqual(SLUG_MAX_LEN);
    expect(out).toMatch(SLUG_REGEX);
  });

  it('strips leading/trailing hyphens', () => {
    expect(generateSubdomainSafeSlug('---hello---')).toBe('hello');
  });

  it('falls back to "org" when input yields nothing', () => {
    expect(generateSubdomainSafeSlug('!!!')).toBe('org');
    expect(generateSubdomainSafeSlug('')).toBe('org');
  });

  it('always satisfies SLUG_REGEX', () => {
    for (const s of ['ab', 'a', 'a-', '-a', 'A B', '1', '##', 'مرحبا']) {
      expect(generateSubdomainSafeSlug(s)).toMatch(SLUG_REGEX);
    }
  });
});
