import { request, type APIRequestContext, type BrowserContext } from '@playwright/test';
import { PWConfig } from './config';
import { promises as fs } from 'node:fs';
import path from 'node:path';

export type Persona =
  | 'superAdmin'
  | 'tenantOwner'
  | 'tenantStaff'
  | 'clientUser'
  | 'crossTenantOwner';

export interface LoginResult {
  accessToken: string;
  /** @deprecated CR-9: refresh token is now an httpOnly cookie (ck_refresh); not returned in body */
  refreshToken?: string;
  userId: string;
  organizationId: string | null;
}

export async function loginViaApi(
  ctx: APIRequestContext,
  email: string,
  password: string,
): Promise<LoginResult> {
  const res = await ctx.post(`${PWConfig.backendBaseUrl}/api/v1/auth/login`, {
    data: { email, password, hCaptchaToken: PWConfig.captchaToken },
  });
  if (!res.ok()) {
    throw new Error(`Login failed for ${email}: ${res.status()} ${await res.text()}`);
  }
  const body = (await res.json()) as {
    accessToken: string;
    user: { id: string; organizationId: string | null };
  };
  // CR-9: refresh token is now an httpOnly cookie set by the server; not in response body.
  return {
    accessToken: body.accessToken,
    userId: body.user.id,
    organizationId: body.user.organizationId,
  };
}

export interface PersonaCredentials {
  persona: Persona;
  email: string;
  password: string;
}

/**
 * Writes a Playwright storageState JSON for the given persona by:
 *  1. Logging in via the API to obtain a JWT.
 *  2. Storing the JWT in localStorage under the dashboard/admin's expected key.
 *  3. Storing as a cookie for the website app (httpOnly client-session token).
 *
 * The same persona file is consumed by every spec via `test.use({ storageState: '<path>' })`,
 * which means specs never hit /auth/login and the throttler never fires.
 */
export async function writePersonaStorageState(
  appBaseUrl: string,
  outFile: string,
  creds: PersonaCredentials,
  opts: { kind: 'localStorage' | 'cookie' } = { kind: 'localStorage' },
): Promise<void> {
  const apiCtx = await request.newContext();
  try {
    const result = await loginViaApi(apiCtx, creds.email, creds.password);
    await fs.mkdir(path.dirname(outFile), { recursive: true });

    const origin = new URL(appBaseUrl).origin;

    if (opts.kind === 'localStorage') {
      // CR-9: refresh token is httpOnly cookie (ck_refresh); not stored in localStorage.
      const state = {
        cookies: [],
        origins: [
          {
            origin,
            localStorage: [
              { name: 'deqah.accessToken', value: result.accessToken },
            ],
          },
        ],
      };
      await fs.writeFile(outFile, JSON.stringify(state, null, 2), 'utf-8');
    } else {
      const url = new URL(appBaseUrl);
      const state = {
        cookies: [
          {
            name: 'deqah.client_session',
            value: result.accessToken,
            domain: url.hostname,
            path: '/',
            httpOnly: true,
            secure: url.protocol === 'https:',
            sameSite: 'Lax' as const,
            expires: Math.floor(Date.now() / 1000) + 60 * 60,
          },
        ],
        origins: [],
      };
      await fs.writeFile(outFile, JSON.stringify(state, null, 2), 'utf-8');
    }
  } finally {
    await apiCtx.dispose();
  }
}

/** Convenience for specs that want a raw bearer token without using storageState. */
export async function bearerHeader(
  ctx: APIRequestContext,
  creds: PersonaCredentials,
): Promise<{ Authorization: string }> {
  const r = await loginViaApi(ctx, creds.email, creds.password);
  return { Authorization: `Bearer ${r.accessToken}` };
}

/** Apply storageState bytes to an existing BrowserContext (used by tests dynamically swapping personas). */
export async function applyStorageState(context: BrowserContext, file: string): Promise<void> {
  const raw = await fs.readFile(file, 'utf-8');
  const state = JSON.parse(raw);
  await context.addCookies(state.cookies ?? []);
  for (const o of state.origins ?? []) {
    for (const item of o.localStorage ?? []) {
      await context.addInitScript(
        ({ origin, name, value }) => {
          if (window.location.origin === origin) {
            window.localStorage.setItem(name, value);
          }
        },
        { origin: o.origin, name: item.name, value: item.value },
      );
    }
  }
}
