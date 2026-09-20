import globals from 'globals';

// Grow this boundary with each extracted module. Frozen engines are excluded.
export default [{
  files: ['src/**/*.js', 'scripts/**/*.js'],
  ignores: ['src/services/ballDontLie/**'],
  rules: {
    'no-restricted-imports': ['error', { patterns: [{
      group: ['**/ballDontLie/bdl*.js'],
      message: 'Use the canonical ballDontLieService.js boundary; legacy injury modules are inactive and locked.',
    }] }],
  },
}, {
  files: ['src/services/ballDontLieService.js', 'src/services/bdl/*.js', 'scripts/lib/scheduler{Games,Process,Clock}.js', 'scripts/scheduler.js', 'scripts/lib/asyncPool.js', 'scripts/lib/results/*.js', 'scripts/run-all-results.js'],
  languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: { ...globals.node, ...globals.browser } },
  rules: {
    'no-undef': 'error',
    'no-dupe-keys': 'error',
    'no-unreachable': 'error',
    'no-import-assign': 'error',
    'no-unexpected-multiline': 'error',
    'valid-typeof': 'error',
  },
}];
