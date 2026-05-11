import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import {
  isZohoDataCenter,
  normalizeDcFromOAuthResponse,
  zohoAccountsBaseUrl,
  type ZohoDataCenter,
} from './zoho-dc';
import type { ZohoOAuthTokenResponse } from './types';

/**
 * Zoho OAuth helper.
 *
 * Encapsulates:
 *   - signed `state` round-trip for the consent redirect (HS256-style HMAC)
 *   - authorization URL builder (correct DC + scope + redirect URI)
 *   - code → tokens exchange after the redirect
 *   - refresh-token → access-token rotation (+ in-memory cache)
 *
 * Access tokens last 1h. We cache them per (orgId, refreshToken-fingerprint)
 * so a credential rotation invalidates the cache without leaking.
 */

interface CachedToken {
  token: string;
  expiresAt: number;
}

interface SignedState {
  organizationId: string;
  dataCenter: ZohoDataCenter;
  nonce: string;
  exp: number; // unix-ms
}

const SCOPES = 'ZohoInvoice.fullaccess.all';
const STATE_TTL_MS = 5 * 60 * 1000;

@Injectable()
export class ZohoOAuthService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ZohoOAuthService.name);
  private readonly tokenCache = new Map<string, CachedToken>();
  private readonly stateSigningKey: Buffer;
  private sweepInterval?: NodeJS.Timeout;

  constructor(private readonly cfg: ConfigService) {
    // Reuse JWT_ACCESS_SECRET as the OAuth-state HMAC key. The state is short-
    // lived (5 min) and only carries non-secret routing data; the same key
    // already protects access tokens of similar value.
    const secret = cfg.get<string>('JWT_ACCESS_SECRET');
    if (!secret) {
      throw new InternalServerErrorException('JWT_ACCESS_SECRET missing');
    }
    this.stateSigningKey = createHash('sha256').update(secret).digest();
  }

  onModuleInit(): void {
    this.sweepInterval = setInterval(() => this.sweep(), 5 * 60_000);
    this.sweepInterval.unref?.();
  }

  onModuleDestroy(): void {
    if (this.sweepInterval) clearInterval(this.sweepInterval);
  }

  private sweep(): void {
    const now = Date.now();
    let removed = 0;
    for (const [key, entry] of this.tokenCache) {
      if (entry.expiresAt < now) {
        this.tokenCache.delete(key);
        removed++;
      }
    }
    if (removed > 0) {
      this.logger.debug(`Swept ${removed} expired token cache entries (size: ${this.tokenCache.size})`);
    }
  }

  // ─── Authorization URL ────────────────────────────────────────────────

  buildAuthorizationUrl(opts: {
    organizationId: string;
    dataCenter: ZohoDataCenter;
  }): { authUrl: string; state: string } {
    const clientId = this.requireClientId();
    const redirectUri = this.requireRedirectUri();
    const state = this.signState({
      organizationId: opts.organizationId,
      dataCenter: opts.dataCenter,
      nonce: randomBytes(16).toString('hex'),
      exp: Date.now() + STATE_TTL_MS,
    });

    const params = new URLSearchParams({
      scope: SCOPES,
      client_id: clientId,
      response_type: 'code',
      access_type: 'offline',
      // `prompt=consent` forces Zoho to issue a fresh refresh_token even if
      // the user has authorised the app before. Without this, Zoho returns
      // only an access_token on the second consent, breaking offline access.
      prompt: 'consent',
      redirect_uri: redirectUri,
      state,
    });
    const authUrl = `${zohoAccountsBaseUrl(opts.dataCenter)}/oauth/v2/auth?${params.toString()}`;
    return { authUrl, state };
  }

  /** Verifies the signed state and returns the original payload. */
  verifyState(rawState: string): SignedState {
    let parsed: SignedState;
    try {
      const [bodyB64, sig] = rawState.split('.');
      if (!bodyB64 || !sig) throw new Error('malformed state');
      const expected = createHmac('sha256', this.stateSigningKey)
        .update(bodyB64)
        .digest('base64url');
      const expectedBuf = Buffer.from(expected);
      const actualBuf = Buffer.from(sig);
      if (
        expectedBuf.length !== actualBuf.length ||
        !timingSafeEqual(expectedBuf, actualBuf)
      ) {
        throw new Error('signature mismatch');
      }
      const json = Buffer.from(bodyB64, 'base64url').toString('utf8');
      parsed = JSON.parse(json) as SignedState;
    } catch (err) {
      this.logger.warn(`Invalid Zoho OAuth state: ${(err as Error).message}`);
      throw new UnauthorizedException('Invalid OAuth state');
    }
    if (parsed.exp < Date.now()) {
      throw new UnauthorizedException('OAuth state expired');
    }
    if (!isZohoDataCenter(parsed.dataCenter)) {
      throw new UnauthorizedException('Invalid OAuth state DC');
    }
    return parsed;
  }

  // ─── Code exchange ────────────────────────────────────────────────────

  async exchangeCodeForTokens(opts: {
    code: string;
    dataCenter: ZohoDataCenter;
  }): Promise<{ tokens: ZohoOAuthTokenResponse; dataCenter: ZohoDataCenter }> {
    const clientId = this.requireClientId();
    const clientSecret = this.requireClientSecret();
    const redirectUri = this.requireRedirectUri();

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code: opts.code,
    });

    const url = `${zohoAccountsBaseUrl(opts.dataCenter)}/oauth/v2/token`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!res.ok) {
      const text = await res.text();
      this.logger.error(`Zoho code exchange failed: ${res.status} ${text}`);
      throw new BadRequestException('Failed to exchange Zoho authorization code');
    }
    const tokens = (await res.json()) as ZohoOAuthTokenResponse & {
      error?: string;
      location?: string;
    };
    if (tokens.error || !tokens.access_token || !tokens.refresh_token) {
      this.logger.error(`Zoho code exchange returned error: ${JSON.stringify(tokens)}`);
      throw new BadRequestException('Zoho did not return a refresh token — retry consent');
    }
    const dataCenter = normalizeDcFromOAuthResponse(
      (tokens as { location?: string }).location,
      opts.dataCenter,
    );
    return { tokens, dataCenter };
  }

  // ─── Access-token cache ───────────────────────────────────────────────

  async getAccessToken(opts: {
    organizationId: string;
    refreshToken: string;
    dataCenter: ZohoDataCenter;
  }): Promise<string> {
    const cacheKey = this.cacheKey(opts.organizationId, opts.refreshToken);
    const cached = this.tokenCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.token;
    }

    const clientId = this.requireClientId();
    const clientSecret = this.requireClientSecret();
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: opts.refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    });

    const res = await fetch(
      `${zohoAccountsBaseUrl(opts.dataCenter)}/oauth/v2/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      },
    );
    if (!res.ok) {
      const text = await res.text();
      this.logger.error(
        `Zoho refresh-token grant failed for org ${opts.organizationId}: ${res.status} ${text}`,
      );
      throw new UnauthorizedException('Zoho refresh token rejected — reconnect required');
    }
    const json = (await res.json()) as ZohoOAuthTokenResponse & { error?: string };
    if (json.error || !json.access_token) {
      throw new UnauthorizedException('Zoho refresh token rejected — reconnect required');
    }
    // 60s buffer.
    const expiresAt = Date.now() + (json.expires_in - 60) * 1000;
    this.tokenCache.set(cacheKey, { token: json.access_token, expiresAt });
    return json.access_token;
  }

  /** Drop any cached access tokens for an org — call after Connect/Disconnect. */
  invalidateToken(organizationId: string): void {
    const prefix = `${organizationId}:`;
    for (const key of this.tokenCache.keys()) {
      if (key.startsWith(prefix)) this.tokenCache.delete(key);
    }
  }

  /**
   * Best-effort revocation. Zoho returns 200 even when the token is already
   * invalid; callers should not throw on failure.
   */
  async revokeRefreshToken(opts: {
    refreshToken: string;
    dataCenter: ZohoDataCenter;
  }): Promise<void> {
    const url = `${zohoAccountsBaseUrl(opts.dataCenter)}/oauth/v2/token/revoke?token=${encodeURIComponent(opts.refreshToken)}`;
    try {
      await fetch(url, { method: 'POST' });
    } catch (err) {
      this.logger.warn(`Zoho revoke failed (non-fatal): ${(err as Error).message}`);
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────

  private signState(state: SignedState): string {
    const bodyB64 = Buffer.from(JSON.stringify(state), 'utf8').toString('base64url');
    const sig = createHmac('sha256', this.stateSigningKey)
      .update(bodyB64)
      .digest('base64url');
    return `${bodyB64}.${sig}`;
  }

  private cacheKey(orgId: string, refreshToken: string): string {
    const fingerprint = createHash('sha256').update(refreshToken).digest('hex').slice(0, 16);
    return `${orgId}:${fingerprint}`;
  }

  private requireClientId(): string {
    const v = this.cfg.get<string>('ZOHO_OAUTH_CLIENT_ID');
    if (!v) throw new InternalServerErrorException('ZOHO_OAUTH_CLIENT_ID is not configured');
    return v;
  }

  private requireClientSecret(): string {
    const v = this.cfg.get<string>('ZOHO_OAUTH_CLIENT_SECRET');
    if (!v) throw new InternalServerErrorException('ZOHO_OAUTH_CLIENT_SECRET is not configured');
    return v;
  }

  private requireRedirectUri(): string {
    const v = this.cfg.get<string>('ZOHO_OAUTH_REDIRECT_URI');
    if (!v) throw new InternalServerErrorException('ZOHO_OAUTH_REDIRECT_URI is not configured');
    return v;
  }
}
