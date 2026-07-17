// ============================================================================
// SICHTBARE TEXTE & SYMBOLE — hier ändern, nicht im übrigen Code suchen.
// Wird von public/index.html und public/search.html importiert.
// ============================================================================

export const SITE_NAME = 'Wine Caching';
export const SITE_TAGLINE = 'Geocaching mit Weinflaschen für den Freundeskreis.';

// Emoji als Logo/Icon. Für ein eigenes Bild statt Emoji: an den Einsatzstellen
// (Suche nach LOGO_EMOJI / BOTTLE_EMOJI in index.html/search.html) durch
// <img src="..." class="brand-icon"> ersetzen.
export const LOGO_EMOJI = '🍷';
export const BOTTLE_EMOJI = '🍾'; // Kompass-Nadel im Such-Modus

// Start-Ansicht der Karten-Auswahl (Owner-UI), bevor der Nutzer selbst zoomt/verschiebt.
export const DEFAULT_MAP_CENTER = { lat: 51.1657, lng: 10.4515 }; // Mitte Deutschlands
export const DEFAULT_MAP_ZOOM = 6;
