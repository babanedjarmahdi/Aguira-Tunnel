import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import pg from 'pg';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../');
const jsonPath = path.join(ROOT, 'output', 'json', 'properties.json');

const { Client } = pg;
const client = new Client({
  host: process.env.PGHOST || 'localhost',
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || 'terraflow',
  password: process.env.PGPASSWORD || 'terraflow',
  database: process.env.PGDATABASE || 'terraflow',
});

async function main() {
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  console.log(`Loading ${data.length} properties...`);

  const aiPath = path.join(ROOT, 'output', 'json', 'properties_ai.json');
  let aiData = [];
  if (fs.existsSync(aiPath)) {
    aiData = JSON.parse(fs.readFileSync(aiPath, 'utf8'));
    console.log(`AI data available for ${aiData.filter((d) => d.ai).length} properties.`);
  }
  const aiByKey = new Map(aiData.map((d) => [`${d.sourceFile}@${d.placemarkIndex ?? 0}`, d.ai]));

  await client.connect();

  // Full sync: remove rows whose source file no longer exists, then upsert current set
  const sourceFiles = [...new Set(data.map((p) => p.sourceFile))];
  await client.query(`DELETE FROM properties WHERE NOT (source_file = ANY($1::text[]))`, [sourceFiles]);
  console.log(`Stale rows removed.`);

  const upsert = `
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

  for (const p of data) {
    const key = `${p.sourceFile}@${p.placemarkIndex ?? 0}`;
    const ai = aiByKey.get(key);
    let price = null;
    if (ai) {
      price = ai.price_in_million != null
        ? ai.price_in_million * 10000
        : (ai.price_per_meter != null && ai.area_m2 != null
            ? (ai.price_per_meter < 100 ? ai.price_per_meter * 1000 : ai.price_per_meter) * ai.area_m2
            : null);
    }
    await client.query(upsert, [
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
      price,
      ai?.price_note ?? null,
      ai?.owner_name ?? null,
      ai?.seller ?? null,
      ai?.phone ?? null,
      ai?.notes ?? null,
      ai ? JSON.stringify(ai) : null,
    ]);
  }

  const count = await client.query(`SELECT count(*)::int AS n FROM properties`);
  console.log(`Done. Total rows in DB: ${count.rows[0].n}`);
  await client.end();
}

main().catch((e) => {
  const msg = e && (e.stack || e.message) ? (e.stack || e.message) : String(e);
  fs.writeFileSync(path.join(ROOT, 'output', 'db_load_error.log'), msg, 'utf8');
  console.error('ERROR written to output/db_load_error.log');
  process.exit(1);
});
