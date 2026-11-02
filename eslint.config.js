// ESLint (configuration « flat ») : règles recommandées, hooks Preact. ESLint 10 suit les références JSX :
// no-undef signale un composant inconnu, no-unused-vars un import qui ne sert qu'en JSX n'est pas « inutilisé ».
import js from '@eslint/js';
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
    plugins: { 'react-hooks': reactHooks },
    rules: {
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
        __DROPBOX_APP_KEY__: 'readonly',
      },
    },
  },
  {
    files: ['public/sw.js'],
    languageOptions: {
      globals: {
        ...globals.serviceworker,
        __PRECACHE__: 'readonly',
        __ON_DEMAND__: 'readonly',
        __VERSION__: 'readonly',
      },
    },
  },
];
