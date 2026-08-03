import AdmZip from 'adm-zip';
import { XMLParser } from 'fast-xml-parser';
import fs from 'fs';
import path from 'path';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: true,
  parseTagValue: false,
});

export function extractKmlFromKmz(kmzPath) {
  const zip = new AdmZip(kmzPath);
  const entries = zip.getEntries();
  const kmlEntry = entries.find((e) => !e.isDirectory && e.entryName.toLowerCase().endsWith('.kml'));
  if (!kmlEntry) {
    throw new Error(`No KML found inside ${kmzPath}`);
  }
  return kmlEntry.getData().toString('utf8');
}

export function parseKml(xmlString) {
  const doc = parser.parse(xmlString);
  const kml = doc.kml || {};
  const document = kml.Document || {};

  const placemarks = [];
  const collect = (node) => {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach(collect);
      return;
    }
    if (node.Placemark) {
      const pms = Array.isArray(node.Placemark) ? node.Placemark : [node.Placemark];
      pms.forEach((p) => {
        if (p && typeof p === 'object') placemarks.push(p);
      });
    }
    if (node.Folder) collect(node.Folder);
  };
  collect(document);

  const parsed = placemarks.map((placemark) => {
    const name = String(placemark.name ?? '');
    const description =
      typeof placemark.description === 'string' ? placemark.description.trim() : '';

    let lon = null;
    let lat = null;
    let alt = null;
    const coordsRaw = placemark.Point && placemark.Point.coordinates;
    if (typeof coordsRaw === 'string' && coordsRaw.trim()) {
      const [lng, la, a] = coordsRaw.trim().split(',');
      lon = parseFloat(lng);
      lat = parseFloat(la);
      alt = a !== undefined ? parseFloat(a) : null;
    }

    let lookLon = null;
    let lookLat = null;
    const look = placemark.LookAt;
    if (look) {
      lookLon = look.longitude !== undefined ? parseFloat(look.longitude) : null;
      lookLat = look.latitude !== undefined ? parseFloat(look.latitude) : null;
    }

    return {
      name,
      description,
      lon,
      lat,
      alt,
      lookAt: { lon: lookLon, lat: lookLat },
    };
  });

  return parsed;
}

export function parseAreaFromName(name) {
  const normalized = name.replace(/[۰-۹]/g, (d) => String.fromCharCode(0x30 + d.charCodeAt(0) - 0x06f0));
  if (/هكتار/.test(normalized)) {
    const m = normalized.match(/(\d+(?:\.\d+)?)/);
    if (m) return Math.round(parseFloat(m[1]) * 10000); // 1 هكتار = 10000 m2
    return null;
  }
  const m = normalized.match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const num = parseFloat(m[1]);
  if (num >= 1000) return Math.round(num); // e.g. 1200م -> 1200
  return Math.round(num);
}

export function normalizeText(text) {
  return (text || '')
    .replace(/[\u064B-\u0652]/g, '')
    .replace(/[\u0600-\u0605\u06DD\u08E2\u066A\u066B\u066C]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function readKmzFiles(sourceDir) {
  if (!fs.existsSync(sourceDir)) {
    throw new Error(`Source dir not found: ${sourceDir}`);
  }
  const files = fs.readdirSync(sourceDir).filter((f) => f.toLowerCase().endsWith('.kmz'));
  return files.map((f) => ({ path: path.join(sourceDir, f), name: f }));
}
