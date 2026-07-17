// End-to-End-Browsertest des kompletten Stacks (Owner-UI + Mitsucher-UI + Backend).
// Benötigt Playwright (nicht in den Projekt-Abhängigkeiten): `npm i -D playwright`.
// Aufruf:  node e2e/browser.mjs
import { chromium } from 'playwright';
import { openDatabase } from '../db/index.js';
import { createRepository } from '../db/repository.js';
import { createApp } from '../app.js';

const TARGET = { lat: 48.137, lng: 11.5754 }; // Wegpunkt
const NEAR = { latitude: 48.13711, longitude: 11.5754, accuracy: 5 }; // ~12 m -> Hinweis frei
const CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/;

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

  await p.waitForSelector('[data-action="enter-owner"]');
  console.log('Owner:');
  assert(true, 'Landing-Screen zuerst (Ersteller vs. Mitsucher)');

  await p.click('[data-action="enter-owner"]');
  await p.waitForSelector('[data-action="mode-register"]');
  await p.click('[data-action="mode-register"]');
  await p.fill('#username', 'e2e-owner');
  await p.fill('#password', 'geheim123');
  await p.click('[data-action="submit-auth"]');
  await p.waitForSelector('[data-action="create-route"]');
  assert(true, 'Registrierung -> Routen-Screen');

  await p.fill('#new-route-name', 'E2E-Runde');
  await p.click('[data-action="create-route"]');
  await p.waitForSelector('[data-action="wp-add"]');
  assert(true, 'Route angelegt -> Detailansicht');

  // Code existiert automatisch schon direkt nach Anlage (keine "Code erzeugen"-Aktion nötig).
  await p.waitForSelector('.code');
  const code = (await p.textContent('.code')).trim();
  assert(CODE_RE.test(code), `Code automatisch erzeugt: ${code}`);
  assert(code === code.toUpperCase(), 'Code wird in Großschreibung angezeigt');

  // Koordinaten per Google-Maps-Paste-Feld eintragen (statt direkter lat/lng-Felder).
  await p.fill('#wp-hint', 'unter der Bank');
  await p.fill('#wp-paste', `${TARGET.lat}, ${TARGET.lng}`);
  await p.click('[data-action="paste-coords"]');
  await p.waitForFunction(() => document.getElementById('wp-lat-deg').value !== '');
  assert(true, 'Koordinaten aus eingefügtem Text übernommen (DMS-Felder befüllt)');

  // Fehlerfall zuerst: Wegpunkt OHNE Hinweis anlegen -> Felder müssen erhalten bleiben (Bug-Report).
  const hintBefore = await p.inputValue('#wp-hint');
  await p.fill('#wp-hint', '');
  await p.click('[data-action="wp-add"]');
  await p.waitForSelector('.error');
  const latDegAfterError = await p.inputValue('#wp-lat-deg');
  assert(latDegAfterError !== '', 'Koordinaten bleiben nach Fehler erhalten (nicht mehr leer)');

  await p.fill('#wp-hint', hintBefore);
  await p.click('[data-action="wp-add"]');
  await p.waitForSelector('[data-action="wp-del"]');
  assert(true, 'Wegpunkt nach Korrektur erfolgreich hinzugefügt');

  await p.click('[data-action="start"]');
  await p.waitForFunction(() => document.querySelector('.badge')?.textContent?.includes('Such-Modus'));
  assert(true, 'Route gestartet (Such-Modus)');

  // --- Mitsucher ---
  const searcher = await browser.newContext({ permissions: ['geolocation'], geolocation: NEAR });
  const s = await searcher.newPage();
  s.on('dialog', (d) => d.accept()); // confirm()-Dialoge (Route neu starten) automatisch bestätigen
  await s.goto(`${base}/search.html`);

  // Code klein/gemischt eingeben -> muss trotzdem funktionieren (case-insensitiv) und live in CAPS erscheinen.
  await s.fill('#code', code.toLowerCase());
  assert((await s.inputValue('#code')) === code, 'Code-Eingabe wird live in Großschreibung dargestellt');
  await s.click('#btn-join');

  await s.waitForSelector('#screen-searching:not(.hidden)', { timeout: 15000 });
  console.log('Mitsucher:');
  assert(true, 'Beitritt mit klein geschriebenem Code -> Such-Modus');

  // Standort-Update anstoßen, damit watchPosition sicher feuert.
  await searcher.setGeolocation({ latitude: 48.137105, longitude: 11.5754, accuracy: 5 });

  await s.waitForFunction(() => !document.getElementById('btn-found').disabled, { timeout: 15000 });
  const bottles = await s.textContent('#dist-bottles');
  assert(bottles !== '–' && /^\d+$/.test(bottles.replaceAll('.', '')), `Flaschenlänge ganzzahlig: "${bottles}"`);
  assert(!(await s.locator('#hint').getAttribute('class')).includes('hidden'), 'Hinweis in Nähe freigeschaltet');

  // Kompass-Rotation: synthetisches Orientation-Event feuern (Bug: Flasche dreht sich nicht).
  // Dieses Sandbox-Chromium kennt den DeviceOrientationEvent-Konstruktor selbst nicht (typeof
  // window.DeviceOrientationEvent === "undefined", verifiziert) — echte Telefone lösen das Event
  // natürlich aus. sensors.js#toOrientationSample liest nur .alpha/.absolute/.webkitCompassHeading
  // vom Objekt (Duck-Typing), daher reicht ein normales Event mit angehängten Properties, um
  // watchOrientation()/die Rotations-Pipeline unabhängig vom Konstruktor zu prüfen.
  const rotationBefore = await s.evaluate(() => document.getElementById('needle').style.transform);
  await s.evaluate(() => {
    const ev = new Event('deviceorientation');
    Object.assign(ev, { alpha: 123, beta: 0, gamma: 0, absolute: false });
    window.dispatchEvent(ev);
  });
  await s.waitForFunction(
    (before) => document.getElementById('needle').style.transform !== before && document.getElementById('needle').style.transform !== '',
    rotationBefore,
    { timeout: 5000 },
  );
  assert(true, 'Kompass-Nadel reagiert auf Orientation-Event (dreht sich)');

  await s.click('#btn-found');
  await s.waitForSelector('#screen-completed:not(.hidden)', { timeout: 15000 });
  assert(true, '„Gefunden" -> Abschluss-Screen');
  assert(await s.locator('#btn-leave2').isVisible(), 'Abschluss-Screen hat einen Verlassen-Button');

  // Route neu starten (mit Warnung) -> zurück in den Such-Modus für denselben Wegpunkt.
  await s.click('#btn-restart');
  await s.waitForSelector('#screen-searching:not(.hidden)', { timeout: 15000 });
  assert(true, '„Route neu starten" führt zurück in den Such-Modus (Bug: Route nie wieder betretbar)');

  await s.click('#btn-leave');
  await s.waitForSelector('#screen-join:not(.hidden)');
  assert(true, '„Verlassen" führt zurück zur Code-Eingabe');

  console.log('\n✅ E2E erfolgreich: Owner + Mitsucher + Backend im echten Browser.');
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
