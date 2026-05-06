import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Pin the contract that every new Zoho mirror table is tenant-scoped at the
 * Prisma extension level. If any of these are removed from SCOPED_MODELS,
 * a future bug could let a query against `ZohoInvoiceLink` (etc.) without an
 * explicit `organizationId` in the where clause return rows from any tenant.
 *
 * This test reads the source file directly rather than importing the runtime
 * module — `prisma.service.ts` declares the registry inside the module body
 * and does not export it. Reading the source pins the textual contract.
 */
describe('Zoho models are registered as SCOPED_MODELS', () => {
  const SOURCE = readFileSync(
    resolve(__dirname, 'prisma.service.ts'),
    'utf8',
  );

  it.each(['ZohoContactLink', 'ZohoInvoiceLink', 'ZohoCreditNoteLink', 'ZohoWebhookEvent', 'IntegrationAuditLog'])(
    'has %s in the SCOPED_MODELS registry',
    (model) => {
      // Match a line of the form:  'ZohoContactLink',  inside the SCOPED_MODELS Set.
      const re = new RegExp(`['"\`]${model}['"\`]\\s*,`);
      expect(SOURCE).toMatch(re);
    },
  );

  it('the registry block lives between `const SCOPED_MODELS` and `]);`', () => {
    // Defence-in-depth: the entries must be inside the Set initializer.
    const startIdx = SOURCE.indexOf('const SCOPED_MODELS');
    const endIdx = SOURCE.indexOf(']);', startIdx);
    expect(startIdx).toBeGreaterThan(0);
    expect(endIdx).toBeGreaterThan(startIdx);
    const slice = SOURCE.slice(startIdx, endIdx);
    for (const m of ['ZohoContactLink', 'ZohoInvoiceLink', 'ZohoCreditNoteLink', 'ZohoWebhookEvent', 'IntegrationAuditLog']) {
      expect(slice).toContain(m);
    }
  });
});
