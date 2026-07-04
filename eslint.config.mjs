// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import localRules from './eslint-rules/no-missing-log-step.js';

export default tseslint.config(
  {
    // Ensure compiled outputs and dependencies are never linted
    ignores: ['eslint.config.mjs', 'dist/**', 'coverage/**', 'node_modules/**'],
  },
  eslint.configs.recommended,
  // Enforces rigorous type-checking for the production build
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // GLOBAL RULES (Applies to all src/ production code)
    rules: {
      'prettier/prettier': ['error', { endOfLine: 'auto' }],

      // Explicitly enforcing strictness to prevent "any" leaks in Domain/Service layers.
      // These are default in recommendedTypeChecked, but explicitly declared here for clarity.
      '@typescript-eslint/unbound-method': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
    },
  },
  {
    // TEST ENVIRONMENT OVERRIDES
    // Targets unit tests, e2e tests, and the standard NestJS test directory
    files: ['**/*.spec.ts', '**/*.e2e-spec.ts', 'test/**/*.ts'],
    rules: {
      // Allows idiomatic Jest syntax: expect(service.method).toHaveBeenCalled()
      '@typescript-eslint/unbound-method': 'off',

      // Relaxes type constraints in tests to allow for Partial<T> mocks
      // and rapid stubbing of deeply nested dependencies.
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    // SERVICE OBSERVABILITY — enforce step-level logging discipline
    // Every logger.log/warn/error call inside a Service class must include a `step`
    // field in the metadata object. This keeps Cloud Logging queries actionable:
    // `jsonPayload.step="duplicate_check"` pinpoints exactly which phase failed.
    // Set as 'warn' for progressive adoption — escalate to 'error' once all
    // existing call sites are updated.
    files: ['**/*.service.ts'],
    plugins: {
      local: localRules,
    },
    rules: {
      'local/no-missing-log-step': 'warn',
    },
  },
);