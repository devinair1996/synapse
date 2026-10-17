import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mode, MODEL, EMBED_MODEL, transcribe } from './lib/llm.js';
import { addItems, clearEvidence, summary, setPeople, getPeopleText, listPeople, SOURCES } from './lib/store.js';
import { fetchGithub } from './lib/connectors/github.js';
import { fetchJira, parseJiraExport } from './lib/connectors/jira.js';
import { parseSlackExport } from './lib/connectors/slack.js';
import { docToItems } from './lib/connectors/drive.js';
import { DEMO_ITEMS, DEMO_PEOPLE, DEMO_COMPETENCIES } from './lib/demo.js';
import { chat } from './lib/chat.js';
import { findEvidence, draftReview } from './lib/review.js';

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

app.disable('x-powered-by');
app.use(express.json({ limit: '25mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const state = () => ({ summary: summary(), people: listPeople(), peopleText: getPeopleText() });

app.get('/api/health', (_req, res) => res.json({ ok: true, mode: mode() }));
app.get('/api/config', (_req, res) => res.json({ mode: mode(), model: MODEL, embedModel: EMBED_MODEL, sources: SOURCES, ...state() }));
app.get('/api/evidence', (_req, res) => res.json(state()));
app.delete('/api/evidence', (_req, res) => { clearEvidence(); res.json(state()); });
app.put('/api/people', (req, res) => { setPeople(req.body?.text); res.json(state()); });

app.post('/api/demo', (_req, res) => {
  clearEvidence();
  setPeople(DEMO_PEOPLE);
  addItems(DEMO_ITEMS);
  res.json({ ...state(), competencies: DEMO_COMPETENCIES });
});

// Connectors. Credentials are used for the request only and are not stored.
const report = (r, extra = {}) => ({ ...r, ...extra, ...state() });
app.post('/api/ingest/github', wrap(async (req, res) => {
  const { items, truncated } = await fetchGithub(req.body || {});
  res.json(report(addItems(items), { fetched: items.length, truncated }));
}));
app.post('/api/ingest/jira', wrap(async (req, res) => {
  const { items, truncated } = await fetchJira(req.body || {});
  res.json(report(addItems(items), { fetched: items.length, truncated }));
}));
app.post('/api/ingest/jira-export', wrap(async (req, res) => {
  const items = parseJiraExport(String(req.body?.content || ''), String(req.body?.filename || ''));
  res.json(report(addItems(items), { fetched: items.length }));
}));
app.post('/api/ingest/slack', wrap(async (req, res) => {
  const files = Array.isArray(req.body?.files) ? req.body.files : [];
  if (!files.length) throw Object.assign(new Error('Choose at least one Slack export file'), { status: 400 });
  let items;
  try { items = parseSlackExport(files, req.body.channel); } catch { throw Object.assign(new Error('Could not read the Slack export. Expected JSON day files.'), { status: 400 }); }
  res.json(report(addItems(items), { fetched: items.length }));
}));
app.post('/api/ingest/doc', wrap(async (req, res) => {
  let text = req.body?.text;
  if (req.body?.pdfBase64) text = await transcribe(req.body.pdfBase64, 'application/pdf');
  if (!text?.trim()) throw Object.assign(new Error('Document is empty'), { status: 400 });
  const items = docToItems({ ...req.body, text });
  res.json(report(addItems(items), { fetched: items.length }));
}));

app.post('/api/chat', wrap(async (req, res) => res.json(await chat(req.body || {}))));
app.post('/api/review/evidence', wrap(async (req, res) => res.json(await findEvidence(req.body || {}))));
app.post('/api/review/draft', wrap(async (req, res) => res.json(await draftReview(req.body || {}))));

app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  if (status >= 500 && !err.status) console.error(err);
  res.status(status).json({ error: status >= 500 && !err.status ? 'Request failed. Check server logs.' : err.message });
});

const port = Number(process.env.PORT) || 8080;
app.listen(port, () => console.log(`SynapseOS listening on :${port} (mode=${mode()}, model=${MODEL})`));
