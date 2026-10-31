// ESLint (configuration « flat ») : règles recommandées, hooks Preact, JSX.
import js from '@eslint/js';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default [
  { ignores: ['dist/', 'node_modules/', 'examples/'] },
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx,mjs}'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { react, 'react-hooks': reactHooks },
    rules: {
      'react/jsx-uses-vars': 'error',
      'react/jsx-no-undef': 'error',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-shadow': 'error',
    },
  },
  // valeurs injectées par build.mjs
  {
    files: ['src/**'],
    languageOptions: {
      globals: {
        __APP_VERSION__: 'readonly',
        __BUILD_ID__: 'readonly',
        __GOOGLE_CLIENT_ID__: 'readonly',
        __MS_CLIENT_ID__: 'readonly',
        __DROPBOX_APP_KEY__: 'readonly',
      },
    },
  },
  {
    files: ['public/sw.js'],
    languageOptions: { globals: { ...globals.serviceworker, __PRECACHE__: 'readonly', __VERSION__: 'readonly' } },
  },
];
