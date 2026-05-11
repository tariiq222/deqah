import { closePrisma, testPrisma } from '../setup/db.setup';

describe('Database Connection Smoke Test', () => {
  jest.setTimeout(30000);

  afterAll(async () => {
    await closePrisma();
  });

  it('connects to PostgreSQL', async () => {
    const result = await testPrisma.$queryRaw`SELECT 1 as test`;
    expect(result).toBeDefined();
  });

  it('retrieves the default organization', async () => {
    const org = await testPrisma.organization.findUnique({
      where: { id: '00000000-0000-0000-0000-000000000001' },
    });
    expect(org).not.toBeNull();
  });
});
