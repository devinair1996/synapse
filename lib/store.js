// Evidence store: every ingested item (commit, PR, ticket, message, doc section)
// is normalised to one shape. In-memory with a JSON file for local persistence.
// Production path: Firestore (items) + Vertex AI Search or embeddings (retrieval).
import fs from 'node:fs';
import path from 'node:path';

const FILE = process.env.EVIDENCE_PATH || path.join(process.cwd(), 'data', 'evidence.json');
export const SOURCES = ['github', 'jira', 'slack', 'drive'];

let items = new Map();
let peopleText = '';
let people = [];

try {
  const saved = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  items = new Map(saved.items.map((i) => [i.id, i]));
  setPeople(saved.peopleText || '');
} catch { /* first run */ }

function persist() {
  if (process.env.EVIDENCE_PERSIST === '0') return;
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify({ items: [...items.values()], peopleText }));
  } catch (err) {
    console.warn('evidence persist failed:', err.message);
  }
}

// People: "Priya Raman: priya, praman, priya@example.com" per line. Applied at
// query time, so editing aliases re-attributes existing items.
export function setPeople(text) {
  peopleText = String(text || '').slice(0, 5000);
  people = peopleText.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const [name, rest = ''] = l.split(':');
    const aliases = [name, ...rest.split(',')].map((a) => a.trim().toLowerCase()).filter(Boolean);
    return { name: name.trim(), aliases: new Set(aliases) };
  });
  persist();
}
export const getPeopleText = () => peopleText;
export const listPeople = () => people.map((p) => p.name);

export function personOf(item) {
  const raw = String(item.author || '').trim().toLowerCase();
  return people.find((p) => p.aliases.has(raw))?.name || item.author || 'unknown';
}

export function addItems(batch) {
  let added = 0, updated = 0, skipped = 0;
  for (const it of batch) {
    const date = new Date(it.date);
    if (!it.id || !it.source || Number.isNaN(date.getTime())) { skipped++; continue; }
    const clean = {
      id: String(it.id), source: it.source, type: it.type || 'item', date: date.toISOString(),
      author: String(it.author || 'unknown').slice(0, 80), title: String(it.title || '').slice(0, 200),
      text: String(it.text || '').slice(0, 4000), url: it.url || '', project: it.project || '', meta: it.meta || {}
    };
    items.has(clean.id) ? updated++ : added++;
    items.set(clean.id, clean);
  }
  persist();
  return { added, updated, skipped };
}

export const getItem = (id) => items.get(id);
export const allItems = () => [...items.values()];
export function clearEvidence() { items = new Map(); persist(); }

export function filterItems({ person, from, to, sources, project } = {}) {
  const f = from ? new Date(from).getTime() : -Infinity;
  const t = to ? new Date(to).getTime() + 86_400_000 : Infinity; // inclusive of the end day
  return allItems().filter((i) => {
    const ts = new Date(i.date).getTime();
    return ts >= f && ts < t
      && (!person || personOf(i) === person)
      && (!sources?.length || sources.includes(i.source))
      && (!project || (i.project || '').toLowerCase() === project.toLowerCase());
  });
}

export function summary() {
  const all = allItems();
  const count = (fn) => all.reduce((m, i) => { const k = fn(i); m[k] = (m[k] || 0) + 1; return m; }, {});
  const dates = all.map((i) => i.date).sort();
  return {
    total: all.length,
    bySource: count((i) => i.source),
    byPerson: count(personOf),
    byMonth: count((i) => i.date.slice(0, 7)),
    from: dates[0] || null,
    to: dates.at(-1) || null
  };
}

export const publicItem = (i) => ({ id: i.id, source: i.source, type: i.type, date: i.date, author: personOf(i), title: i.title, text: i.text.slice(0, 600), url: i.url, status: i.meta?.status || '' });
