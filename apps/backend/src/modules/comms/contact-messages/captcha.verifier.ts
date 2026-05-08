import { Injectable, Logger } from '@nestjs/common';

export const CAPTCHA_VERIFIER = Symbol('CAPTCHA_VERIFIER');

export interface CaptchaVerifier {
  verify(token: string | undefined | null): Promise<boolean>;
}

@Injectable()
export class NoopCaptchaVerifier implements CaptchaVerifier {
  async verify(_token: string | undefined | null): Promise<boolean> {
    return true;
  }
}

@Injectable()
export class HCaptchaVerifier implements CaptchaVerifier {
  private readonly logger = new Logger(HCaptchaVerifier.name);

  async verify(token: string | undefined | null): Promise<boolean> {
    if (!token) return false;
    const secret = process.env.HCAPTCHA_SECRET;
    if (!secret) {
      this.logger.warn('HCAPTCHA_SECRET not configured; rejecting token.');
      return false;
    }
    try {
      const res = await fetch('https://api.hcaptcha.com/siteverify', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ secret, response: token }).toString(),
      });
      const json = (await res.json()) as { success?: boolean };
      return json.success === true;
    } catch (err) {
      this.logger.warn(`hCaptcha verify failed: ${(err as Error).message}`);
      return false;
    }
  }
}

@Injectable()
export class TurnstileCaptchaVerifier implements CaptchaVerifier {
  private readonly logger = new Logger(TurnstileCaptchaVerifier.name);

  async verify(token: string | undefined | null): Promise<boolean> {
    if (!token) return false;
    const secret = process.env.TURNSTILE_SECRET;
    if (!secret) {
      this.logger.warn('TURNSTILE_SECRET not configured; rejecting token.');
      return false;
    }
    try {
      const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ secret, response: token }).toString(),
      });
      const json = (await res.json()) as { success?: boolean };
      return json.success === true;
    } catch (err) {
      this.logger.warn(`Turnstile verify failed: ${(err as Error).message}`);
      return false;
    }
  }
}

export function createCaptchaVerifier(): CaptchaVerifier {
  const provider = process.env.CAPTCHA_PROVIDER ?? 'noop';
  if (process.env.NODE_ENV === 'production' && provider === 'noop') {
    throw new Error(
      'CAPTCHA_PROVIDER=noop is forbidden in production; set it to hcaptcha or turnstile',
    );
  }
  if (provider === 'hcaptcha') return new HCaptchaVerifier();
  if (provider === 'turnstile') return new TurnstileCaptchaVerifier();
  return new NoopCaptchaVerifier();
}
