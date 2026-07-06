// ESLint Flat Config (ESLint v9). Kein Build-Step — hält Backend (Node) und
// Client (Browser) Vanilla-JS konsistent. Stubs mit ungenutzten Parametern -> Warnung, kein Fehler.
import js from '@eslint/js';

export default [
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module' },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    // Backend / Node
    files: ['server.js', 'routes/**', 'middleware/**', 'lib/**', 'db/**', 'scripts/**', 'test/**'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        URL: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
      },
    },
  },
  {
    // Client / Browser
    files: ['public/**/*.js'],
    languageOptions: {
      globals: {
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        screen: 'readonly',
        fetch: 'readonly',
        localStorage: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        performance: 'readonly',
        DeviceOrientationEvent: 'readonly',
      },
    },
  },
];
