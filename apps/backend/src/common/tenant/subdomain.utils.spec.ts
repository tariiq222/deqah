import {
  extractSubdomain,
  isReservedSubdomain,
  normalizeHost,
  DEFAULT_RESERVED_SUBDOMAINS,
} from './subdomain.utils';

describe('subdomain.utils', () => {
  describe('normalizeHost', () => {
    it('strips port and lowercases', () => {
      expect(normalizeHost('SAWA.Deqah.NET:443')).toBe('sawa.deqah.net');
    });
    it('returns null for IPv4', () => {
      expect(normalizeHost('178.105.84.5')).toBeNull();
    });
    it('returns null for empty', () => {
      expect(normalizeHost('')).toBeNull();
      expect(normalizeHost(undefined)).toBeNull();
    });
  });

  describe('extractSubdomain', () => {
    it('returns subdomain when host ends with rootDomain', () => {
      expect(extractSubdomain('sawa.deqah.net', 'deqah.net')).toBe('sawa');
    });
    it('returns null when host equals rootDomain', () => {
      expect(extractSubdomain('deqah.net', 'deqah.net')).toBeNull();
    });
    it('returns null when host does not end with rootDomain', () => {
      expect(extractSubdomain('sawa.example.com', 'deqah.net')).toBeNull();
    });
    it('handles multi-label subdomain (returns full prefix; caller filters)', () => {
      expect(extractSubdomain('a.b.deqah.net', 'deqah.net')).toBe('a.b');
    });
    it('lowercases input', () => {
      expect(extractSubdomain('SAWA.DEQAH.NET', 'deqah.net')).toBe('sawa');
    });
    it('strips port', () => {
      expect(extractSubdomain('sawa.deqah.net:443', 'deqah.net')).toBe('sawa');
    });
    it('works for localhost root', () => {
      expect(extractSubdomain('sawa.localhost:5103', 'localhost')).toBe('sawa');
    });
    it('returns null for plain localhost', () => {
      expect(extractSubdomain('localhost', 'localhost')).toBeNull();
    });
    it('returns null for IP', () => {
      expect(extractSubdomain('178.105.84.5', 'deqah.net')).toBeNull();
    });
  });

  describe('isReservedSubdomain', () => {
    it('flags built-in reserved names', () => {
      for (const r of ['www', 'api', 'admin', 'app', 'auth', 'staging']) {
        expect(isReservedSubdomain(r, DEFAULT_RESERVED_SUBDOMAINS)).toBe(true);
      }
    });
    it('case-insensitive', () => {
      expect(isReservedSubdomain('WWW', DEFAULT_RESERVED_SUBDOMAINS)).toBe(true);
    });
    it('non-reserved returns false', () => {
      expect(isReservedSubdomain('sawa', DEFAULT_RESERVED_SUBDOMAINS)).toBe(false);
    });
    it('multi-label flagged via dot', () => {
      // multi-label like "a.b" is not a single subdomain label; treat as reserved/invalid
      expect(isReservedSubdomain('a.b', DEFAULT_RESERVED_SUBDOMAINS)).toBe(true);
    });
    it('honors extra reserved set', () => {
      expect(isReservedSubdomain('myextra', new Set(['myextra']))).toBe(true);
    });

    it('treats newly added infrastructure subdomains as reserved', () => {
      const newEntries = [
        'assets',
        'dev',
        'errors',
        'files',
        'grafana',
        'media',
        'metrics',
        'monitoring',
        'prod',
        'production',
        'prometheus',
        'qa',
        'socket',
        'test',
        'webhook',
        'webhooks',
        'ws',
      ];
      for (const entry of newEntries) {
        expect(isReservedSubdomain(entry, DEFAULT_RESERVED_SUBDOMAINS)).toBe(true);
      }
    });
  });
});
