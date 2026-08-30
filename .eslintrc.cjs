/* eslint-env node */
module.exports = {
  root: true,
  env: { browser: true, es2022: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  plugins: ['@typescript-eslint', 'react-refresh'],
  ignorePatterns: ['dist', 'node_modules', '*.cjs', 'vite.config.ts'],
  rules: {
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

    // The codebase leans on `_`-prefixed discards when destructuring away a
    // field (e.g. pulling `id` off a doc before writing the rest back).
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' },
    ],

    // Firestore documents arrive as `any`; the serialize layer is where that
    // gets narrowed, and warning on every field read there is just noise.
    '@typescript-eslint/no-explicit-any': 'warn',
  },
  overrides: [
    {
      // Effects that intentionally key off a subset of their dependencies —
      // re-seeding a form or re-subscribing a listener on every object
      // identity change is the bug, not the fix.
      files: ['src/store/*.tsx', 'src/pages/Settings.tsx', 'src/components/trade/TradeDetail.tsx'],
      rules: { 'react-hooks/exhaustive-deps': 'off' },
    },
  ],
}
