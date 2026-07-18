// Zwischenablage kopieren mit Fallback. navigator.clipboard.writeText fehlt/scheitert in
// manchen In-App-Browsern und älteren WebViews auch bei HTTPS — dann per unsichtbarem
// Textfeld + document.execCommand('copy') versuchen (veraltet, aber breit unterstützt).
// Wirft nur, wenn wirklich beide Wege fehlschlagen.
export async function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // weiter zum Fallback (z. B. Berechtigung verweigert, kein sicherer Kontext)
    }
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  document.body.removeChild(textarea);

  if (!ok) {
    throw new Error('Kopieren wird hier nicht unterstützt — bitte den Code manuell markieren und kopieren.');
  }
}
