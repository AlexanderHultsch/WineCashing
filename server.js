// Wine Caching — Express-App (Wiring).
// Basis-Pfad /api, JSON, ISO-8601-UTC-Zeiten. Fehler-Umschlag: middleware/errorEnvelope.js.

import express from 'express';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import authRouter from './routes/auth.js';
import routesRouter from './routes/routes.js';
import progressRouter from './routes/progress.js';
import { errorHandler } from './middleware/errorEnvelope.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json());
// TODO: express-session mit httpOnly-Cookie konfigurieren (Vertrag A.1).

app.use('/api/auth', authRouter);
app.use('/api', progressRouter);   // /api/join
app.use('/api/routes', routesRouter);
app.use('/api/routes', progressRouter); // /:routeId/state, /:routeId/waypoints/:wpId/found|skip

app.use(express.static(join(__dirname, 'public')));

app.use(errorHandler);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Wine Caching läuft auf http://localhost:${PORT}`));

export default app;
