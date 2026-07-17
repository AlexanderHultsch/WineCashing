// End-to-End-Browsertest des kompletten Stacks (Owner-UI + Mitsucher-UI + Backend).
// Benötigt Playwright (nicht in den Projekt-Abhängigkeiten): `npm i -D playwright`.
// Aufruf:  node e2e/browser.mjs
import { chromium } from 'playwright';
import { openDatabase } from '../db/index.js';
import { createRepository } from '../db/repository.js';
import { createApp } from '../app.js';

const TARGET = { latitude: 48.137, longitude: 11.5754, accuracy: 5 }; // Wegpunkt-Position
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
  const owner = await browser.newContext({
    permissions: ['clipboard-write', 'clipboard-read', 'geolocation'],
    geolocation: TARGET,
  });
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

  // Hamburger-Nav: eingeloggter Nutzer, "Route erstellen" als aktuelle Seite markiert.
  await p.click('#nav-toggle');
  await p.waitForSelector('#nav-menu:not(.hidden)');
  assert((await p.textContent('.nav-user')).includes('e2e-owner'), 'Nav zeigt eingeloggten Nutzernamen');
  assert(await p.locator('[data-nav="logout"]').isVisible(), 'Nav zeigt Logout (nicht Login)');
  assert((await p.getAttribute('[data-nav="create"]', 'class')).includes('active'), '"Route erstellen" als aktuelle Seite markiert');
  await p.click('#nav-toggle'); // wieder schließen

  await p.fill('#new-route-name', 'E2E-Runde');
  await p.click('[data-action="create-route"]');
  await p.waitForSelector('[data-action="wp-add"]');
  assert(true, 'Route angelegt -> Detailansicht');

  // Code existiert automatisch schon direkt nach Anlage (keine "Code erzeugen"-Aktion nötig).
  await p.waitForSelector('.code');
  const code = (await p.textContent('.code')).trim();
  assert(CODE_RE.test(code), `Code automatisch erzeugt: ${code}`);
  assert(code === code.toUpperCase(), 'Code wird in Großschreibung angezeigt');

  // Code kopieren -> Button zeigt kurz eine Bestätigung.
  await p.click('[data-action="copy-code"]');
  await p.waitForFunction(() => document.querySelector('[data-action="copy-code"]')?.textContent.includes('Kopiert'));
  const clipboardText = await p.evaluate(() => navigator.clipboard.readText());
  assert(clipboardText === code, 'Code-Kopieren-Button schreibt den Code ins Clipboard');

  // "Aktuellen Standort verwenden" zuerst (zentriert die Karte dort, siehe Tipp-Text im UI),
  // dann die Karten-Auswahl öffnen und exakt in der Mitte bestätigen (bleibt dadurch nahe am
  // Standort, statt irgendwo auf der Deutschland-Übersichtskarte zu landen) — testet beide
  // Wege, eine Position zu setzen, ohne den Suchradius für den späteren Mitsucher zu sprengen.
  await p.click('[data-action="use-location"]');
  await p.waitForFunction(() => document.querySelector('.info')?.textContent.includes('Position übernommen'));
  assert(true, '"Aktuellen Standort verwenden" zeigt sichtbare Bestätigung');

  await p.click('[data-action="open-map-picker"]');
  await p.waitForSelector('#map-overlay:not(.hidden)');
  await p.waitForTimeout(200); // Leaflet-Init + invalidateSize
  const mapBox = await p.locator('#map-picker').boundingBox();
  // Klick auf die Kartenmitte (dort liegt schon die "aktueller Standort"-Position) bestätigt,
  // dass Karten-Klicks den Marker/das Readout aktualisieren, ohne die Position weit vom
  // simulierten Mitsucher-Standort wegzubewegen.
  await p.mouse.click(mapBox.x + mapBox.width / 2, mapBox.y + mapBox.height / 2);
  await p.waitForFunction(() => document.getElementById('map-picker-coords').textContent.includes(','));
  await p.click('#map-picker-confirm');
  await p.waitForFunction(() => document.getElementById('map-overlay').classList.contains('hidden'));
  assert(await p.locator('.info').first().textContent().then((t) => t.includes('Position übernommen')), 'Position aus Karten-Auswahl übernommen');

  // Fehlerfall: Wegpunkt OHNE Hinweis anlegen -> Name/Hinweis UND die gewählte Position bleiben erhalten.
  await p.fill('#wp-name', 'Alte Eiche');
  await p.click('[data-action="wp-add"]');
  await p.waitForSelector('.error');
  assert((await p.inputValue('#wp-name')) === 'Alte Eiche', 'Name bleibt nach Fehler erhalten');
  assert(await p.locator('.info').first().textContent().then((t) => t.includes('Position übernommen')), 'Position bleibt nach Fehler erhalten');

  await p.fill('#wp-hint', 'hinter dem dritten Stein');
  await p.click('[data-action="wp-add"]');
  await p.waitForSelector('[data-action="wp-del"]');
  assert(true, 'Wegpunkt nach Korrektur erfolgreich hinzugefügt');

  await p.click('[data-action="start"]');
  await p.waitForFunction(() => document.querySelector('.badge')?.textContent?.includes('Such-Modus'));
  assert(true, 'Route gestartet (Such-Modus)');
  await p.waitForSelector('button:disabled:has-text("Route aktiv")');
  assert(true, '"Suche starten" wird nach dem Start zu einem deaktivierten "Route aktiv"-Button');

  // --- Mitsucher ---
  const searcher = await browser.newContext({ permissions: ['geolocation'], geolocation: NEAR });
  const s = await searcher.newPage();
  s.on('dialog', (d) => d.accept()); // confirm()-Dialoge (Route neu starten) automatisch bestätigen
  await s.goto(`${base}/search.html`);

  await s.click('#nav-toggle');
  await s.waitForSelector('#nav-menu:not(.hidden)');
  assert(await s.locator('[data-nav="login"]').isVisible(), 'Nav zeigt "Login" (anonymer Kontext, nicht eingeloggt)');
  const searchNavClass = await s.locator('.nav-menu a', { hasText: 'Mitsuchen' }).getAttribute('class');
  assert(searchNavClass.includes('active'), '"Mitsuchen" ist auf search.html als aktuelle Seite markiert');
  await s.click('#nav-toggle');

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
