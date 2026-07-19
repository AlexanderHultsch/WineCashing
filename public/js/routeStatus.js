// Abgeleiteter Anzeigestatus einer Route (Bugs 1/3/5, Amendment). `status` und
// `route_code_active` sind zwei getrennte DB-Felder, wurden bisher aber inkonsistent
// einzeln angezeigt (z. B. "Route aktiv" allein aus status, ohne route_code_active zu
// prüfen). Dieser Tri-State fasst beides in EINER Anzeige/Steuerung zusammen:
//   erstellung  — status === 'erstellung' (Suche nie gestartet)
//   aktiv       — such_modus UND route_code_active
//   deaktiviert — such_modus, aber route_code_active === false (Zugang gesperrt)
export function deriveRouteDisplayStatus(route) {
  if (route.status !== 'such_modus') return 'erstellung';
  return route.route_code_active ? 'aktiv' : 'deaktiviert';
}

// Ein Eintrag pro Status statt zweier paralleler Lookup-Objekte (Review-Fix): sonst
// könnte ein künftiger vierter Status in einem der beiden Objekte ergänzt werden, aber
// im anderen vergessen werden — das fiele erst zur Laufzeit als "undefined" im Badge auf.
// badgeClass ist der CSS-Modifikator für die bestehenden .badge.on/.badge.off-Klassen
// (styles.css); '' bleibt beim neutralen Grau-Ton der Basis-.badge-Klasse.
export const ROUTE_DISPLAY_STATUS_META = {
  erstellung: { label: 'Erstellung', badgeClass: '' },
  aktiv: { label: 'Aktiv', badgeClass: 'on' },
  deaktiviert: { label: 'Deaktiviert', badgeClass: 'off' },
};
