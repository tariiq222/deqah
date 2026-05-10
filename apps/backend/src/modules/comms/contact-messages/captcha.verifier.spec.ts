import { createCaptchaVerifier, HCaptchaVerifier, NoopCaptchaVerifier } from './captcha.verifier';

describe('createCaptchaVerifier', () => {
  const ORIGINAL_ENV = process.env;
  beforeEach(() => { process.env = { ...ORIGINAL_ENV }; });
  afterAll(() => { process.env = ORIGINAL_ENV; });

  it('returns Noop when NODE_ENV !== production and provider unset', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.CAPTCHA_PROVIDER;
    expect(createCaptchaVerifier()).toBeInstanceOf(NoopCaptchaVerifier);
  });

  it('throws when NODE_ENV=production and provider unset', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.CAPTCHA_PROVIDER;
    expect(() => createCaptchaVerifier()).toThrow(/CAPTCHA_PROVIDER/);
  });

  it('throws when NODE_ENV=production and provider=noop', () => {
    process.env.NODE_ENV = 'production';
    process.env.CAPTCHA_PROVIDER = 'noop';
    expect(() => createCaptchaVerifier()).toThrow(/noop/);
  });

  it('returns HCaptchaVerifier in production with provider=hcaptcha', () => {
    process.env.NODE_ENV = 'production';
    process.env.CAPTCHA_PROVIDER = 'hcaptcha';
    expect(createCaptchaVerifier()).toBeInstanceOf(HCaptchaVerifier);
  });

  describe('CR-10 — E2E_TEST bypass gate', () => {
    it('E2E_TEST=true + NODE_ENV=test → bypass active (NoopCaptchaVerifier returned)', () => {
      process.env.E2E_TEST = 'true';
      process.env.NODE_ENV = 'test';
      delete process.env.CAPTCHA_PROVIDER;
      // In non-production the noop provider is always the default fallback,
      // and E2E_TEST=true makes the intent explicit. Confirm Noop is returned.
      expect(createCaptchaVerifier()).toBeInstanceOf(NoopCaptchaVerifier);
    });

    it('E2E_TEST=true + NODE_ENV=production → bypass refused (throws on noop)', () => {
      process.env.E2E_TEST = 'true';
      process.env.NODE_ENV = 'production';
      process.env.CAPTCHA_PROVIDER = 'noop';
      // Belt + suspenders: production guard fires regardless of E2E_TEST.
      expect(() => createCaptchaVerifier()).toThrow(/noop/);
    });

    it('E2E_TEST=undefined + NODE_ENV=test → falls through to Noop (default dev path)', () => {
      delete process.env.E2E_TEST;
      process.env.NODE_ENV = 'test';
      delete process.env.CAPTCHA_PROVIDER;
      expect(createCaptchaVerifier()).toBeInstanceOf(NoopCaptchaVerifier);
    });

    it('E2E_TEST=true + NODE_ENV=production + provider=hcaptcha → production path unaffected', () => {
      process.env.E2E_TEST = 'true';
      process.env.NODE_ENV = 'production';
      process.env.CAPTCHA_PROVIDER = 'hcaptcha';
      // Production with a real provider is always fine.
      expect(createCaptchaVerifier()).toBeInstanceOf(HCaptchaVerifier);
    });
  });
});
