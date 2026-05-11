import SuperTest from 'supertest';
import { createTestApp, closeTestApp } from '../setup/app.setup';
import { closePrisma } from '../setup/db.setup';

describe('Server Smoke Tests', () => {
  let req: SuperTest.Agent;

  beforeAll(async () => {
    ({ request: req } = await createTestApp());
  }, 60000);

  afterAll(async () => {
    await closeTestApp();
    await closePrisma();
  });

  it('starts the NestJS application and responds to health', async () => {
    const res = await req.get('/health');
    expect([200, 503]).toContain(res.status);
  });
});
