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

export const ROUTE_DISPLAY_STATUS_LABEL = {
  erstellung: 'Erstellung',
  aktiv: 'Aktiv',
  deaktiviert: 'Deaktiviert',
};

// CSS-Modifikator für die bestehenden .badge.on/.badge.off-Klassen (styles.css).
export const ROUTE_DISPLAY_STATUS_BADGE_CLASS = {
  erstellung: '',
  aktiv: 'on',
  deaktiviert: 'off',
};
