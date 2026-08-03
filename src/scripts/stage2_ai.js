import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractPropertyWithAI, pacingDelayMs } from '../lib/ai.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../');
const jsonPath = path.join(ROOT, 'output', 'json', 'properties.json');
const outPath = path.join(ROOT, 'output', 'json', 'properties_ai.json');

const API_KEY = process.env.GROQ_API_KEY;

async function main() {
  if (!API_KEY) {
    console.error('GROQ_API_KEY not set in .env');
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  console.log(`Extracting AI fields for ${data.length} properties...`);

  // Resume-safe: load previous results, skip entries already having valid ai
  let previous = [];
  if (fs.existsSync(outPath)) {
    try {
      previous = JSON.parse(fs.readFileSync(outPath, 'utf8'));
      console.log(`Found previous run with ${previous.length} entries - resuming.`);
    } catch {
      previous = [];
    }
  }
  const prevByKey = new Map(previous.map((p) => [`${p.sourceFile}@${p.placemarkIndex ?? 0}`, p]));

  const results = [];
  let ok = 0;
  const failures = [];

  for (let i = 0; i < data.length; i++) {
    const entry = data[i];
    const key = `${entry.sourceFile}@${entry.placemarkIndex ?? 0}`;
    const label = `${i + 1}/${data.length} ${entry.sourceFile}`;
    const cached = prevByKey.get(key);
    if (cached && cached.ai) {
      results.push(cached);
      ok++;
      console.log(`[CACHE] ${label}`);
      continue;
    }
    try {
      const ai = await extractPropertyWithAI(entry, API_KEY);
      results.push({ ...entry, ai });
      ok++;
      console.log(`[OK] ${label} -> ${ai.property_type ?? '?'} / ${ai.price_in_million ?? ai.price_per_meter ?? 'no price'}`);
    } catch (e) {
      results.push({ ...entry, ai: null, aiError: e.message });
      failures.push({ sourceFile: entry.sourceFile, error: e.message });
      console.log(`[FAIL] ${label}: ${e.message}`);
    }
    // Write incrementally so long runs never lose progress
    fs.writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf8');
    // Throttle to stay under free-tier rate limits
    await new Promise((r) => setTimeout(r, pacingDelayMs()));
  }

  fs.writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf8');
  console.log(`\nDone. OK: ${ok}, Failed: ${failures.length}`);
  console.log(`Output: ${outPath}`);
  if (failures.length) {
    console.log('\nFailures:');
    failures.forEach((f) => console.log(`  - ${f.sourceFile}: ${f.error}`));
  }
  process.exit(failures.length ? 2 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
