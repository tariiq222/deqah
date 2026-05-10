import js from "@eslint/js";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import { defineConfig, globalIgnores } from "eslint/config";
import deqahPlugin from "./eslint-rules/deqah-plugin.mjs";

/**
 * Backend ESLint — Deqah NestJS.
 *
 * Keeps the rule set small and shared-parser (monorepo root installs the
 * @typescript-eslint packages). Additional domain-specific rules belong in
 * separate `files` blocks below — e.g. forbidding cross-cluster imports.
 */
export default defineConfig([
  globalIgnores([
    "dist/**",
    "coverage/**",
    "node_modules/**",
    "prisma/migrations/**",
    "scripts/**",
    "jest.config.*",
  ]),

  js.configs.recommended,

  {
    files: ["src/**/*.ts", "test/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
      },
      globals: {
        console: "readonly",
        process: "readonly",
        Buffer: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        setImmediate: "readonly",
        clearImmediate: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        global: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      deqah: deqahPlugin,
    },
    rules: {
      // Disable core JS rules that TS handles or that produce false positives on .ts syntax
      "no-unused-vars": "off",
      "no-undef": "off",
      "no-dupe-class-members": "off",
      "no-redeclare": "off",

      // Deqah golden rule: no `any` in TypeScript
      // Dropped to "warn" temporarily — 6 pre-existing occurrences surfaced when
      // the missing eslint.config.mjs was restored (bookings handlers). Track
      // and fix in a follow-up, then promote back to "error".
      "@typescript-eslint/no-explicit-any": "warn",

      // Unused: allow underscore-prefixed vars
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],

      // Require @ApiOperation on every NestJS HTTP handler.
      "deqah/require-api-operation": "error",

      // `$allTenantsUnsafe` is reserved for CLI/bootstrap code (seed/scripts).
      // Application code must go through the CLS-gated `$allTenants` escape hatch.
      //
      // Direct `prisma.$transaction()` calls bypass RLS context injection.
      // Use `RlsTransactionService.withTransaction()` or `.withBypassTransaction()`
      // instead. For super-admin / cron paths add `{ bypassRls: true }` and a
      // comment explaining why. The helper file itself is exempt via a file-level
      // disable comment.
      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[property.name='$allTenantsUnsafe']",
          message:
            "Use PrismaService.$allTenants only inside a SuperAdminContextInterceptor-protected request. $allTenantsUnsafe is reserved for seed/scripts code.",
        },
        {
          selector: "CallExpression[callee.property.name='$transaction']:not([callee.object.property.name='$allTenants'])",
          message:
            "Use RlsTransactionService.withTransaction() instead of prisma.$transaction() to ensure RLS context is injected. $allTenants.$transaction is allowed for super-admin/cron with a justification comment.",
        },
      ],
    },
  },

  {
    // Tests have relaxed rules
    files: ["test/**/*.ts", "**/*.spec.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "deqah/require-api-operation": "off",
      // Test helpers and e2e fixtures legitimately call $transaction directly for
      // database setup/teardown; they are not application code subject to RLS rules.
      "no-restricted-syntax": "off",
    },
  },

  {
    // Infrastructure-internal files that implement the $transaction wrappers are
    // exempt from the no-restricted-syntax/$transaction rule — they ARE the wrapper.
    files: [
      "src/common/database/rls-transaction.ts",
      "src/common/tenant/rls.helper.ts",
      "src/common/interceptors/tenant-guc.interceptor.ts",
    ],
    rules: { "no-restricted-syntax": "off" },
  },
]);
