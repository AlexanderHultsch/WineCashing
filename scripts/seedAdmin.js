// Admin-Bootstrap (Vertrag A.3): legt den ersten is_admin-Nutzer an.
// Liest ADMIN_USERNAME / ADMIN_PASSWORD aus der Umgebung (siehe .env.example).
// Idempotent: existiert der Nutzer bereits, wird er nicht überschrieben.
// Aufruf:  npm run seed:admin
//
// TODO: DB öffnen (db/index.js -> getDb/migrate), Passwort hashen (bcrypt/argon2),
//       Nutzer mit is_admin = 1 anlegen (UUID als id), bei Konflikt nichts ändern.

const username = process.env.ADMIN_USERNAME;
const password = process.env.ADMIN_PASSWORD;

if (!username || !password) {
  console.error('Fehlt: ADMIN_USERNAME und ADMIN_PASSWORD müssen gesetzt sein (siehe .env.example).');
  process.exit(1);
}

async function main() {
  throw new Error('seedAdmin: TODO — Admin-Nutzer anlegen');
}

main()
  .then(() => console.log(`Admin "${username}" bereit.`))
  .catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
