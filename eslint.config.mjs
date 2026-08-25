import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/*.tsbuildinfo'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
    },
    rules: {
      // `_`-prefixed parameters document a port's signature even when unused by one impl.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      // The domain models real optionality; `undefined` and `null` are not interchangeable here.
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': 'error',
      'prefer-const': 'error',
      'no-var': 'error',
      'object-shorthand': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      // `erasableSyntaxOnly` already bans enums and parameter properties at compile time;
      // this makes the reason visible in the editor rather than only at build time.
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    // The CLI is the presentation layer: writing to stdout is its job.
    files: ['packages/cli/src/**/*.ts', 'packages/node/src/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    files: ['**/test/**/*.ts', 'packages/core/src/testing/**/*.ts'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    // Build scripts run under Node directly, so they get the Node globals.
    files: ['scripts/**/*.mjs', 'packages/*/bin/*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { console: 'readonly', process: 'readonly' },
    },
    rules: { 'no-console': 'off' },
  },
);
