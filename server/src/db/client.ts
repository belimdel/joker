import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

// Crée le pool pg + instance Drizzle. Retourne null si DATABASE_URL est absent
// (mode dégradé : le serveur démarre quand même, sans persistance).
function createDb() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.warn('⚠️  DATABASE_URL manquant — persistance BDD désactivée (mode dégradé).');
    return null;
  }
  const pool = new Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
  });
  return drizzle(pool, { schema });
}

export const db = createDb();
export type DrizzleDb = NonNullable<typeof db>;
