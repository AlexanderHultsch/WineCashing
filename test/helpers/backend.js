// Test-Harness fürs Backend: echte App gegen :memory:-SQLite, HTTP über fetch.
import { openDatabase } from '../../db/index.js';
import { createRepository } from '../../db/repository.js';
import { createApp } from '../../app.js';

export async function bootBackend() {
  const db = openDatabase(':memory:');
  const repo = createRepository(db);
  const app = createApp({ repo, enableRateLimit: false, secureCookie: false });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}`,
    repo,
    db,
    close: () => new Promise((r) => server.close(r)),
  };
}

// Kleiner HTTP-Client mit Cookie-Jar (für die Owner-Session).
export function createClient(baseUrl) {
  let cookie = null;
  async function req(method, path, body, headers = {}) {
    const res = await fetch(baseUrl + path, {
      method,
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(cookie ? { cookie } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    const text = await res.text();
    let json = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }
    return { status: res.status, body: json, text };
  }
  return {
    get: (p, h) => req('GET', p, undefined, h),
    post: (p, b, h) => req('POST', p, b, h),
    patch: (p, b, h) => req('PATCH', p, b, h),
    put: (p, b, h) => req('PUT', p, b, h),
    del: (p, h) => req('DELETE', p, undefined, h),
  };
}
