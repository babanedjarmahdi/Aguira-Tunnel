import fs from 'fs';
import path from 'path';
import { extractKmlFromKmz, parseKml, parseAreaFromName, normalizeText, readKmzFiles } from './kmz.js';

function stripDuplicateWhitespace(text) {
  return (text || '').replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
}

function cleanDesc(desc) {
  return stripDuplicateWhitespace(normalizeText(desc));
}

function coordsKey(entry) {
  const prec = 5;
  return `${entry.lat.toFixed(prec)},${entry.lon.toFixed(prec)}`;
}

export function extractAll(sourceDir) {
  const parsedFiles = [];
  const failures = [];

  for (const file of readKmzFiles(sourceDir)) {
    try {
      const kml = extractKmlFromKmz(file.path);
      const parsed = parseKml(kml);
      if (!parsed.length) {
        failures.push({ file: file.name, reason: 'no Placemark' });
        continue;
      }
      parsed.forEach((p, idx) => {
        parsedFiles.push({
          entry: {
            sourceFile: file.name,
            placemarkIndex: idx,
            name: p.name,
            areaM2: parseAreaFromName(p.name),
            description: p.description,
            lat: p.lat,
            lon: p.lon,
            alt: p.alt,
          },
          file,
        });
      });
    } catch (e) {
      failures.push({ file: file.name, reason: e.message });
    }
  }

  // Smart dedupe: group by area bucket + coords, then by normalized description
  const groups = new Map();
  for (const pf of parsedFiles) {
    const key = `${pf.entry.areaM2 ?? 'na'}@${pf.entry.lat != null ? coordsKey(pf.entry) : 'nocoords'}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(pf);
  }

  const deduped = [];
  const removed = [];

  for (const [groupKey, items] of groups) {
    if (items.length === 1) {
      deduped.push(items[0]);
      continue;
    }
    const descGroups = new Map();
    for (const item of items) {
      const dk = cleanDesc(item.entry.description);
      if (!descGroups.has(dk)) descGroups.set(dk, []);
      descGroups.get(dk).push(item);
    }
    for (const [dk, members] of descGroups) {
      members.sort((a, b) => a.file.name.length - b.file.name.length);
      const rep = members[0];
      deduped.push(rep);
      members.slice(1).forEach((dup) => {
        removed.push({ kept: rep.file.name, removedFile: dup.file.name, reason: `duplicate description (${groupKey})` });
      });
    }
  }

  deduped.sort((a, b) => (a.entry.areaM2 ?? 0) - (b.entry.areaM2 ?? 0));
  const json = deduped.map((d) => d.entry);

  return { properties: json, removed, failures };
}
