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
const repo = createRepository(db);
const app = createApp({ repo, enableRateLimit: false, secureCookie: false });
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
  await p.waitForFunction(() => document.querySelector('.badge')?.textContent?.includes('Aktiv'));
  assert(true, 'Route gestartet -> Status-Badge "Aktiv" in der Routen-Steuerung (Bug 3)');
  await p.waitForSelector('[data-action="code-deactivate"]');
  assert(true, '"Route aktivieren" wird nach dem Start zum "Route deaktivieren"-Umschalter (Bugs 1/5)');

  // Deaktivieren -> Status "Deaktiviert", Umschalter dreht auf "Route wieder aktivieren".
  await p.click('[data-action="code-deactivate"]');
  await p.waitForFunction(() => document.querySelector('.badge')?.textContent?.includes('Deaktiviert'));
  await p.waitForSelector('[data-action="code-activate"]');
  assert(true, 'Route deaktivieren -> Badge "Deaktiviert" + Reaktivieren-Umschalter (Bug 5)');

  // Reaktivieren MUSS wieder greifen (Bug 1: früher blieb der Button wirkungslos grau).
  await p.click('[data-action="code-activate"]');
  await p.waitForFunction(() => document.querySelector('.badge')?.textContent?.includes('Aktiv'));
  await p.waitForSelector('[data-action="code-deactivate"]');
  assert(true, 'Route wieder aktivieren funktioniert -> Badge "Aktiv" (Bug 1 behoben)');

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

  // --- Info & Datenschutz (Bug 7): aus dem Burger-Menü erreichbar, nennt Admin-Rechte. ---
  await p.click('#nav-toggle');
  await p.waitForSelector('#nav-menu:not(.hidden)');
  const infoLink = p.locator('.nav-menu a', { hasText: 'Datenschutz' });
  assert(await infoLink.isVisible(), 'Nav enthält "Info & Datenschutz" (Bug 7)');
  await infoLink.click();
  await p.waitForSelector('h1:has-text("Info")');
  assert((await p.textContent('body')).includes('Admin'), 'Datenschutz-Seite nennt die Admin-Rechte explizit (Bug 7)');
  assert((await p.textContent('body')).includes('nicht an den Server gesendet'), 'Datenschutz-Seite nennt: Standort bleibt auf dem Gerät');

  // --- Admin-Panel (Frage 6): Nutzer zum Admin machen, Panel im echten Browser prüfen. ---
  console.log('Admin:');
  const adminOwner = await repo.getUserByUsername('e2e-owner');
  repo.setUserAdmin(adminOwner.id, true);

  const admin = await browser.newContext();
  const a = await admin.newPage();
  a.on('dialog', (d) => d.accept()); // Lösch-Bestätigungen automatisch bestätigen
  await a.goto(`${base}/index.html`);
  await a.waitForSelector('[data-action="enter-owner"]');
  await a.click('[data-action="enter-owner"]');
  await a.waitForSelector('[data-action="mode-login"], [data-action="submit-auth"]');
  await a.fill('#username', 'e2e-owner');
  await a.fill('#password', 'geheim123');
  await a.click('[data-action="submit-auth"]');
  await a.waitForSelector('[data-action="create-route"]');

  await a.click('#nav-toggle');
  await a.waitForSelector('#nav-menu:not(.hidden)');
  const adminLink = a.locator('.nav-menu a', { hasText: 'Admin' });
  assert(await adminLink.isVisible(), 'Admin-Menüpunkt nur für is_admin sichtbar (Frage 6)');
  await adminLink.click();
  await a.waitForSelector('h1:has-text("Admin")');
  assert(true, 'Admin-Panel öffnet sich');
  await a.waitForSelector('.admin-table');
  const adminBody = await a.textContent('body');
  assert(adminBody.includes('E2E-Runde'), 'Admin sieht die Route in der Routen-Tabelle (mit Ersteller/Status/Code)');
  assert(adminBody.includes('e2e-owner'), 'Admin sieht die Nutzerliste');
  // Neuer Code für die fremde Route über das Admin-Panel.
  const codeCellBefore = await a.locator('.admin-table td').filter({ hasText: CODE_RE }).first().textContent();
  await a.click('[data-action="admin-code-renew"]');
  await a.waitForFunction(
    (before) => !document.body.textContent.includes(before.trim()),
    codeCellBefore,
    { timeout: 5000 },
  );
  assert(true, 'Admin kann für eine fremde Route einen neuen Code erzeugen (Frage 6)');

  console.log('\n✅ E2E erfolgreich: Owner + Mitsucher + Admin + Backend im echten Browser.');
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
