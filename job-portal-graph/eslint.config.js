export default [
  {
    ignores: [
      'node_modules/**',
      '.cache/**',
      'benchmarks/results/**',
      'public/vendor/**',
      'scripts/out-*/**',
    ],
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
];
