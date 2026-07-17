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
    files: ['app.js', 'server.js', 'routes/**', 'middleware/**', 'lib/**', 'db/**', 'scripts/**', 'test/**'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        URL: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        // test/sensors.test.js simuliert `window` via Node-eingebautem EventTarget/Event,
        // um public/js/sensors.js ohne echten Browser zu testen.
        EventTarget: 'readonly',
        Event: 'readonly',
        window: 'writable',
      },
    },
  },
  {
    // E2E: Node-Treiber + im Browser ausgeführte page-Funktionen
    files: ['e2e/**'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        document: 'readonly',
        window: 'readonly',
        Event: 'readonly',
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
