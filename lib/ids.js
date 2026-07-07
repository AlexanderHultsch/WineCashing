// UUID-Erzeugung für Datenmodell-IDs (TEXT). Node-eingebaut, keine Abhängigkeit.
import { randomUUID } from 'node:crypto';

export function newId() {
  return randomUUID();
}
