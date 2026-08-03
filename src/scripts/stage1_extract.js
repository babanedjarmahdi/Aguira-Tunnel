import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractAll } from '../lib/extractor.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../');
const sourceDir = process.env.SOURCE_KMZ_DIR;
const doneDir = process.env.DONE_KMZ_DIR;
const outDir = path.join(ROOT, 'output', 'json');
const outFile = path.join(outDir, 'properties.json');
const reportFile = path.join(outDir, 'dedupe_report.txt');

const { properties, removed, failures } = extractAll(sourceDir);

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(properties, null, 2), 'utf8');

// Copy every processed KMZ into the "done" folder (marker)
let copied = 0;
if (doneDir) {
  fs.mkdirSync(doneDir, { recursive: true });
  const seen = new Set();
  for (const p of properties) {
    if (seen.has(p.sourceFile)) continue;
    seen.add(p.sourceFile);
    const src = path.join(sourceDir, p.sourceFile);
    if (fs.existsSync(src)) {
      try {
        fs.copyFileSync(src, path.join(doneDir, p.sourceFile));
        copied++;
      } catch (e) {
        console.error(`  copy failed: ${p.sourceFile}: ${e.message}`);
      }
    }
  }
}

const lines = [];
lines.push(`Source dir: ${sourceDir}`);
lines.push(`Total KMZ scanned: ${removed.length + properties.length + failures.length}`);
lines.push(`Parse failures: ${failures.length}`);
lines.push(`Unique properties: ${properties.length}`);
lines.push(`Removed duplicates: ${removed.length}`);
lines.push(`Copied to done folder: ${copied}`);
lines.push('');
lines.push('=== Removed duplicates ===');
for (const r of removed) {
  lines.push(`[removed] ${r.removedFile}\n          kept as: ${r.kept} (${r.reason})`);
}
lines.push('');
lines.push('=== Parse failures ===');
for (const f of failures) {
  lines.push(`[failed] ${f.file}: ${f.reason}`);
}
fs.writeFileSync(reportFile, lines.join('\n'), 'utf8');

console.log(lines.join('\n'));
console.log(`\nJSON written: ${outFile}`);
