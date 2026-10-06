// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
      'backend/src/generated/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  // Boundary rules (plan §4.3): frontend and backend may only share code through `@app/shared`.
  {
    files: ['frontend/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['@app/backend', '@app/backend/*', '**/backend/**'], message: 'Frontend must not import backend code. Use @app/shared or the API.' }] },
      ],
    },
  },
  {
    files: ['backend/**/*.ts'],
    languageOptions: { globals: globals.node },
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['@app/frontend', '@app/frontend/*', '**/frontend/**'], message: 'Backend must not import frontend code.' }] },
      ],
    },
  },
  {
    files: ['shared/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@app/backend', '@app/frontend', '**/backend/**', '**/frontend/**'], message: 'shared/ must not depend on frontend or backend.' },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.config.{js,ts,mjs}', 'eslint.config.js'],
    languageOptions: { globals: globals.node },
  },
);
