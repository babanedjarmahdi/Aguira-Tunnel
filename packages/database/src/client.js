import fs from 'fs';
import path from 'path';
import pg from 'pg';
import { computePriceDzd } from '@terraflow/shared';

export const DEFAULTS = {
  host: 'localhost',
  port: 5432,
  user: 'terraflow',
  password: 'terraflow',
  database: 'terraflow',
};

export function createDb(env = {}) {
  const { Client } = pg;
  return new Client({
    host: env.PGHOST || DEFAULTS.host,
    port: Number(env.PGPORT || DEFAULTS.port),
    user: env.PGUSER || DEFAULTS.user,
    password: env.PGPASSWORD || DEFAULTS.password,
    database: env.PGDATABASE || DEFAULTS.database,
  });
}

export const UPSERT = `
  INSERT INTO properties (source_file, placemark_idx, name, area_m2, description, lat, lon, alt,
                          property_type, status, location, price, price_note, owner_name, seller, owner_phone, notes, ai_raw)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18::jsonb)
  ON CONFLICT (source_file, placemark_idx) DO UPDATE SET
    name = EXCLUDED.name,
    area_m2 = EXCLUDED.area_m2,
    description = EXCLUDED.description,
    lat = EXCLUDED.lat,
    lon = EXCLUDED.lon,
    alt = EXCLUDED.alt,
    property_type = EXCLUDED.property_type,
    status = EXCLUDED.status,
    location = EXCLUDED.location,
    price = EXCLUDED.price,
    price_note = EXCLUDED.price_note,
    owner_name = EXCLUDED.owner_name,
    seller = EXCLUDED.seller,
    owner_phone = EXCLUDED.owner_phone,
    notes = EXCLUDED.notes,
    ai_raw = EXCLUDED.ai_raw
`;

// Full sync: remove rows whose source file no longer exists, then upsert current set.
// Mirrors the original stage1_loaddb behavior exactly.
export async function syncProperties(client, { data, aiData }) {
  const aiByKey = new Map((aiData || []).map((d) => [`${d.sourceFile}@${d.placemarkIndex ?? 0}`, d.ai]));

  const sourceFiles = [...new Set(data.map((p) => p.sourceFile))];
  await client.query(`DELETE FROM properties WHERE NOT (source_file = ANY($1::text[]))`, [sourceFiles]);

  for (const p of data) {
    const key = `${p.sourceFile}@${p.placemarkIndex ?? 0}`;
    const ai = aiByKey.get(key);
    await client.query(UPSERT, [
      p.sourceFile,
      p.placemarkIndex ?? 0,
      p.name ?? null,
      p.areaM2 ?? null,
      p.description ?? null,
      p.lat ?? null,
      p.lon ?? null,
      p.alt ?? null,
      ai?.property_type ?? null,
      ai?.status ?? null,
      ai?.location ?? null,
      ai ? computePriceDzd(ai) : null,
      ai?.price_note ?? null,
      ai?.owner_name ?? null,
      ai?.seller ?? null,
      ai?.phone ?? null,
      ai?.notes ?? null,
      ai ? JSON.stringify(ai) : null,
    ]);
  }

  const count = await client.query(`SELECT count(*)::int AS n FROM properties`);
  return count.rows[0].n;
}

// CLI-friendly loader replicating stage1_loaddb: reads output/json files from disk.
export async function loadFromDisk({ jsonPath, aiPath, env = {} }) {
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  let aiData = [];
  if (fs.existsSync(aiPath)) aiData = JSON.parse(fs.readFileSync(aiPath, 'utf8'));

  const client = createDb(env);
  await client.connect();
  try {
    return await syncProperties(client, { data, aiData });
  } finally {
    await client.end();
  }
}

export function loadFromJsonFiles(rootDir, env = {}) {
  const jsonPath = path.join(rootDir, 'output', 'json', 'properties.json');
  const aiPath = path.join(rootDir, 'output', 'json', 'properties_ai.json');
  return loadFromDisk({ jsonPath, aiPath, env });
}
