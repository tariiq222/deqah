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
});
