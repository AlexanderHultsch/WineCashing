// End-to-End-Browsertest des kompletten Stacks (Owner-UI + Mitsucher-UI + Backend).
// Benötigt Playwright (nicht in den Projekt-Abhängigkeiten): `npm i -D playwright`.
// Aufruf:  node e2e/browser.mjs
import { chromium } from 'playwright';
import { openDatabase } from '../db/index.js';
import { createRepository } from '../db/repository.js';
import { createApp } from '../app.js';

const TARGET = { lat: 48.137, lng: 11.5754 }; // Wegpunkt
const NEAR = { latitude: 48.13711, longitude: 11.5754, accuracy: 5 }; // ~12 m -> Hinweis frei

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERT: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

const db = openDatabase(':memory:');
const app = createApp({ repo: createRepository(db), enableRateLimit: false, secureCookie: false });
const server = await new Promise((r) => {
  const s = app.listen(0, () => r(s));
});
const base = `http://127.0.0.1:${server.address().port}`;
// Vorinstalliertes Chromium nutzen (Version kann von der Playwright-Lib abweichen).
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium',
});

try {
  // --- Owner ---
  const owner = await browser.newContext();
  const p = await owner.newPage();
  await p.goto(`${base}/index.html`);

  await p.click('[data-action="mode-register"]');
  await p.fill('#username', 'e2e-owner');
  await p.fill('#password', 'geheim123');
  await p.click('[data-action="submit-auth"]');
  await p.waitForSelector('[data-action="create-route"]');
  console.log('Owner:');
  assert(true, 'Registrierung -> Routen-Screen');

  await p.fill('#new-route-name', 'E2E-Runde');
  await p.click('[data-action="create-route"]');
  await p.waitForSelector('[data-action="wp-add"]');
  assert(true, 'Route angelegt -> Detailansicht');

  await p.fill('#wp-hint', 'unter der Bank');
  await p.fill('#wp-lat', String(TARGET.lat));
  await p.fill('#wp-lng', String(TARGET.lng));
  await p.click('[data-action="wp-add"]');
  await p.waitForSelector('[data-action="wp-del"]');
  assert(true, 'Wegpunkt hinzugefügt');

  await p.click('[data-action="start"]');
  await p.waitForFunction(() => document.querySelector('.badge')?.textContent?.includes('Such-Modus'));
  assert(true, 'Route gestartet (Such-Modus)');

  await p.click('[data-action="code-create"]');
  await p.waitForSelector('.code');
  const code = (await p.textContent('.code')).trim();
  assert(/^[A-HJ-NP-Za-hj-np-z2-9]{4}-[A-HJ-NP-Za-hj-np-z2-9]{4}$/.test(code), `Code erzeugt: ${code}`);

  // --- Mitsucher ---
  const searcher = await browser.newContext({ permissions: ['geolocation'], geolocation: NEAR });
  const s = await searcher.newPage();
  await s.goto(`${base}/search.html`);
  await s.fill('#code', code);
  await s.click('#btn-join');

  await s.waitForSelector('#screen-searching:not(.hidden)', { timeout: 15000 });
  console.log('Mitsucher:');
  assert(true, 'Beitritt -> Such-Modus');

  // Standort-Update anstoßen, damit watchPosition sicher feuert.
  await searcher.setGeolocation({ latitude: 48.137105, longitude: 11.5754, accuracy: 5 });

  await s.waitForFunction(() => !document.getElementById('btn-found').disabled, { timeout: 15000 });
  const bottles = await s.textContent('#dist-bottles');
  assert(bottles !== '–' && bottles.length > 0, `Distanz gerendert (${bottles} Flaschenlängen)`);
  assert(!(await s.locator('#hint').getAttribute('class')).includes('hidden'), 'Hinweis in Nähe freigeschaltet');

  await s.click('#btn-found');
  await s.waitForSelector('#screen-completed:not(.hidden)', { timeout: 15000 });
  assert(true, '„Gefunden" -> Abschluss-Screen');

  console.log('\n✅ E2E erfolgreich: Owner + Mitsucher + Backend im echten Browser.');
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
