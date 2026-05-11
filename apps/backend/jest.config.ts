import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', { diagnostics: false }],
  },
  collectCoverageFrom: [
    'src/**/*.(t|j)s',
    '!src/modules/**/index.ts',
    '!src/api/**/index.ts',
    '!src/infrastructure/**/index.ts',
  ],
  coverageDirectory: './coverage',
  coverageThreshold: {
    global: {
      branches: 65,
      functions: 70,
      lines: 85,
      statements: 85,
    },
  },
  setupFiles: ['<rootDir>/test/jest.setup.ts'],
  testEnvironment: 'node',
  modulePathIgnorePatterns: ['<rootDir>/dist/'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    // file-type@22 is ESM-only and cannot be loaded by ts-jest in CJS mode.
    // Redirect to a CJS-compatible manual mock for the test environment.
    // Production code uses `await import('file-type')` which works at runtime.
    '^file-type$': '<rootDir>/src/__mocks__/file-type.ts',
  },
  transformIgnorePatterns: ['node_modules/(?!(uuid)/)'],
};

export default config;
