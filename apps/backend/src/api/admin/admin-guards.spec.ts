import * as fs from 'fs';
import * as path from 'path';

describe('Admin controllers guard invariants', () => {
  const adminDir = path.resolve(__dirname);
  const controllers = fs
    .readdirSync(adminDir)
    .filter((f) => f.endsWith('.controller.ts') && !f.endsWith('.spec.ts'));

  const REQUIRED = [
    'AdminHostGuard',
    'JwtGuard',
    'SuperAdminGuard',
    'SuperAdminContextInterceptor',
  ] as const;

  it('should find at least one admin controller', () => {
    expect(controllers.length).toBeGreaterThan(0);
  });

  controllers.forEach((file) => {
    describe(file, () => {
      const content = fs.readFileSync(path.join(adminDir, file), 'utf8');

      REQUIRED.forEach((guard) => {
        it(`imports and uses ${guard}`, () => {
          expect(content).toContain(guard);
        });
      });
    });
  });
});
