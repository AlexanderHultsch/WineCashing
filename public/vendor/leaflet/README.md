# Vendored: Leaflet 1.9.4

Selbst gehostet statt per CDN eingebunden — keine Abhängigkeit von einem externen
CDN-Uptime, konsistent mit dem Rest des Projekts ("keine nativen Abhängigkeiten").

Enthalten sind nur die Laufzeit-Dateien aus dem `leaflet`-npm-Paket
(`dist/leaflet.js`, `dist/leaflet.css`, `dist/images/*`), keine Sourcemaps.
Lizenz: BSD-2-Clause (siehe `LICENSE`), Quelle: https://www.npmjs.com/package/leaflet

**Aktualisieren:**

```bash
npm install --no-save leaflet
cp node_modules/leaflet/dist/leaflet.js public/vendor/leaflet/leaflet.js
cp node_modules/leaflet/dist/leaflet.css public/vendor/leaflet/leaflet.css
cp node_modules/leaflet/dist/images/*.png public/vendor/leaflet/images/
cp node_modules/leaflet/LICENSE public/vendor/leaflet/LICENSE
```

Hinweis: Die Kartenkacheln selbst (OpenStreetMap-Tiles) kommen weiterhin live
aus dem Internet — das ist bei jeder Karten-Lösung (auch Google Maps) so und
lässt sich nicht sinnvoll selbst hosten.
