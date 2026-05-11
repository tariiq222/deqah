import { parseUuidHeader } from './uuid-header.util';

describe('parseUuidHeader()', () => {
  it('accepts well-formed UUID', () => {
    expect(parseUuidHeader('550e8400-e29b-41d4-a716-446655440000')).toBe(
      '550e8400-e29b-41d4-a716-446655440000',
    );
  });

  it('accepts the all-zero DEFAULT_ORGANIZATION_ID', () => {
    expect(parseUuidHeader('00000000-0000-0000-0000-000000000001')).toBe(
      '00000000-0000-0000-0000-000000000001',
    );
  });

  it('rejects non-string values', () => {
    expect(parseUuidHeader(undefined)).toBeUndefined();
    expect(parseUuidHeader(123)).toBeUndefined();
    expect(parseUuidHeader(null)).toBeUndefined();
  });

  it('rejects malformed UUIDs', () => {
    expect(parseUuidHeader('not-a-uuid')).toBeUndefined();
    expect(parseUuidHeader('550e8400-e29b-41d4-a716')).toBeUndefined();
    expect(parseUuidHeader('550e8400e29b41d4a716446655440000')).toBeUndefined();
  });

  it('trims whitespace', () => {
    expect(parseUuidHeader('  550e8400-e29b-41d4-a716-446655440000  ')).toBe(
      '550e8400-e29b-41d4-a716-446655440000',
    );
  });

  it('rejects multi-value (string[]) headers', () => {
    expect(
      parseUuidHeader(['550e8400-e29b-41d4-a716-446655440000', 'x']),
    ).toBeUndefined();
  });
});
