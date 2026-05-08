import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { IsCidrOrIpArray } from './is-cidr-or-ip.validator';

class TestDto {
  @IsCidrOrIpArray()
  list!: string[];
}

describe('IsCidrOrIpArray', () => {
  const ok = (list: unknown) =>
    validate(plainToInstance(TestDto, { list }), { skipMissingProperties: true });

  it('accepts valid IPv4 addresses', async () => {
    const errors = await ok(['1.2.3.4', '10.0.0.1']);
    expect(errors).toHaveLength(0);
  });

  it('accepts valid IPv4 CIDR ranges', async () => {
    expect(await ok(['10.0.0.0/8', '192.168.1.0/24'])).toHaveLength(0);
  });

  it('accepts valid IPv6 addresses', async () => {
    expect(await ok(['::1', '2001:db8::1'])).toHaveLength(0);
  });

  it('accepts valid IPv6 CIDR ranges', async () => {
    expect(await ok(['2001:db8::/32'])).toHaveLength(0);
  });

  it('accepts an empty array (means no allowlist)', async () => {
    expect(await ok([])).toHaveLength(0);
  });

  it('rejects malformed strings', async () => {
    const errors = await ok(['not-an-ip']);
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints?.IsCidrOrIpArray).toMatch(/not-an-ip/);
  });

  it('rejects empty strings inside the array', async () => {
    expect(await ok(['1.2.3.4', ''])).toHaveLength(1);
  });

  it('rejects when value is not an array', async () => {
    expect(await ok('1.2.3.4')).toHaveLength(1);
  });

  it('rejects mixed valid + invalid', async () => {
    const errors = await ok(['10.0.0.0/8', 'garbage']);
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints?.IsCidrOrIpArray).toContain('garbage');
  });
});
