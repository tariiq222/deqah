import { writePersonaStorageState } from './auth';
import type { PersonaCredentials } from './auth';
import { PWConfig } from './config';
import path from 'node:path';

interface AppRoot {
  app: 'dashboard' | 'admin' | 'website';
  baseUrl: string;
  authStateKind: 'localStorage' | 'cookie';
}

const APP_ROOTS: AppRoot[] = [
  { app: 'dashboard', baseUrl: PWConfig.dashboardBaseUrl, authStateKind: 'localStorage' },
  { app: 'admin', baseUrl: PWConfig.adminBaseUrl, authStateKind: 'localStorage' },
  { app: 'website', baseUrl: PWConfig.websiteBaseUrl, authStateKind: 'cookie' },
];

const personas: PersonaCredentials[] = [
  { persona: 'superAdmin', email: PWConfig.superAdminEmail, password: PWConfig.superAdminPassword },
];

export default async function globalSetup(): Promise<void> {
  // Force the captcha shim regardless of caller env.
  process.env.CAPTCHA_PROVIDER = 'noop';

  const ROOT = process.env.PW_REPO_ROOT ?? process.cwd();

  for (const root of APP_ROOTS) {
    for (const p of personas) {
      const out = path.join(
        ROOT,
        'apps',
        root.app,
        PWConfig.authStateDir,
        `${p.persona}.json`,
      );
      try {
        await writePersonaStorageState(root.baseUrl, out, p, { kind: root.authStateKind });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // Don't fail global setup if a single persona fails — surface the spec failure
        // with a clear hint rather than masking it as a setup error.
        // eslint-disable-next-line no-console
        console.warn(`[pw-global-setup] skipping ${p.persona}@${root.app}: ${msg}`);
      }
    }
  }
}
