// Serverzeit in ISO 8601 UTC (Vertrag A.2). Der Server verlässt sich nie auf Client-Zeit.
export function nowIso() {
  return new Date().toISOString();
}
