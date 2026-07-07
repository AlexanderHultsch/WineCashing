// Einstiegspunkt: DB öffnen, Repository + App verdrahten, lauschen.
import { openDatabase } from './db/index.js';
import { createRepository } from './db/repository.js';
import { createApp } from './app.js';

const db = openDatabase();
const repo = createRepository(db);
const app = createApp({ repo });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Wine Caching läuft auf http://localhost:${PORT}`));
