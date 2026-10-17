// Content-addressed cache for model calls. Protects free-tier rate limits and
// lets a pre-run audit act as a demo fallback. File-backed, ephemeral on Cloud Run.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const FILE = process.env.CACHE_PATH || path.join(process.cwd(), 'data', 'cache.json');
let store = {};
try { store = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { store = {}; }

export const hash = (...parts) => crypto.createHash('sha1').update(JSON.stringify(parts)).digest('hex');

export function cacheGet(key) { return store[key]; }
export function cacheSet(key, value) {
  store[key] = value;
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(store));
  } catch (err) {
    console.warn('cache write failed:', err.message);
  }
}
