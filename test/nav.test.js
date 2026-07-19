// renderNavHtml ist eine reine String-Funktion (kein DOM nötig). Ausführen:
//   node --test test/nav.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderNavHtml } from '../public/js/nav.js';

test('renderNavHtml: escaped den Nutzernamen (Review-Fix: Stored-Self-XSS über username)', () => {
  const html = renderNavHtml({ active: 'create', user: '<img src=x onerror=alert(1)>' });
  assert.ok(!html.includes('<img src=x onerror=alert(1)>'), 'unescaped Payload darf nicht im Markup landen');
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'), 'Payload erscheint escaped');
});

test('renderNavHtml: Admin-Menüpunkt nur mit isAdmin, sonst nicht im Markup', () => {
  assert.ok(renderNavHtml({ active: 'create', user: 'bob', isAdmin: true }).includes('data-nav="admin"'));
  assert.ok(!renderNavHtml({ active: 'create', user: 'bob', isAdmin: false }).includes('data-nav="admin"'));
  assert.ok(!renderNavHtml({ active: 'create', user: 'bob' }).includes('data-nav="admin"'), 'isAdmin default false');
});

test('renderNavHtml: markiert den aktiven Menüpunkt', () => {
  const html = renderNavHtml({ active: 'search', user: null });
  assert.match(html, /class="nav-item active"[^>]*href="search\.html"/);
});
