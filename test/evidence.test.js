import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.OFFLINE = '1';
process.env.EVIDENCE_PERSIST = '0';
process.env.CACHE_PATH = '/tmp/synapse-test-cache.json';
const store = await import('../lib/store.js');
const { DEMO_ITEMS, DEMO_PEOPLE, DEMO_COMPETENCIES } = await import('../lib/demo.js');
const { chat } = await import('../lib/chat.js');
const { findEvidence, draftReview, parseCompetencies } = await import('../lib/review.js');
const { verifyClaims } = await import('../lib/verify.js');
const { normaliseCommits, normalisePulls } = await import('../lib/connectors/github.js');
const { normaliseIssues, parseJiraExport, adfToText } = await import('../lib/connectors/jira.js');
const { parseSlackExport } = await import('../lib/connectors/slack.js');

function load() {
  store.clearEvidence();
  store.setPeople(DEMO_PEOPLE);
  store.addItems(DEMO_ITEMS);
}

test('verifier drops invented ids and flags numbers not in the cited items', () => {
  const allowed = new Map([['A', { id: 'A', title: 'PR #1', text: 'Latency fell from 800ms to 320ms', date: '2026-03-01T00:00:00.000Z' }]]);
  const r = verifyClaims([
    { text: 'Latency fell from 800ms to 320ms', itemIds: ['A'] },
    { text: 'Shipped the feature', itemIds: ['FAKE'] },
    { text: 'Latency fell by 90%', itemIds: ['A', 'FAKE'] }
  ], allowed);
  assert.equal(r.claims.length, 2);
  assert.equal(r.dropped.badIds, 2);
  assert.equal(r.dropped.noCitation, 1);
  assert.deepEqual(r.claims[1].unverifiedNumbers, ['90%']);
  assert.deepEqual(r.claims[0].unverifiedNumbers, []);
});

test('employee chat is scoped to the person and finds buried mentoring work', async () => {
  load();
  const r = await chat({ question: 'What mentoring have I done?', role: 'employee', person: 'Priya Raman' });
  assert.ok(r.claims.length > 0);
  assert.ok(Object.values(r.evidence).every((e) => e.author === 'Priya Raman'));
  assert.ok(r.claims.some((c) => c.itemIds.some((id) => id.startsWith('SL-eng-help'))), 'buried Slack mentoring not found');
  assert.ok(r.coverage.itemsInStore > r.coverage.retrieved);
});

test('chat requires evidence and a person for employees', async () => {
  store.clearEvidence();
  await assert.rejects(() => chat({ question: 'x', role: 'employee', person: 'A' }), /No evidence/);
  load();
  await assert.rejects(() => chat({ question: 'x', role: 'employee' }), /who you are/);
});

test('manager team update spans people; standup preset uses a recent window', async () => {
  load();
  const team = await chat({ question: '', role: 'manager', preset: 'team' });
  const authors = new Set(Object.values(team.evidence).map((e) => e.author));
  assert.ok(authors.size > 1);
  const mine = await chat({ question: '', role: 'employee', person: 'Lena Novak', preset: 'standup' });
  assert.ok(mine.claims.length > 0);
  assert.ok(Object.values(mine.evidence).every((e) => e.author === 'Lena Novak' && Date.now() - new Date(e.date) < 8 * 86400000));
});

test('managers cannot generate review evidence or drafts', async () => {
  load();
  await assert.rejects(() => findEvidence({ role: 'manager', person: 'Priya Raman', competencies: 'Delivery: x' }), /employee-owned/);
  await assert.rejects(() => draftReview({ role: 'manager', person: 'Priya Raman', claims: [] }), /employee-owned/);
});

test('review evidence flags thin competencies and the draft only cites own, selected evidence', async () => {
  load();
  const marcus = await findEvidence({ role: 'employee', person: 'Marcus Lee', competencies: DEMO_COMPETENCIES });
  const mentoring = marcus.competencies.find((c) => /mentoring/i.test(c.name));
  assert.equal(mentoring.thin, true, 'Marcus has no mentoring evidence');
  const priya = await findEvidence({ role: 'employee', person: 'Priya Raman', competencies: DEMO_COMPETENCIES });
  const claims = priya.competencies[0].claims.slice(0, 2);
  const draft = await draftReview({ role: 'employee', person: 'Priya Raman', claims });
  assert.ok(draft.paragraphs.length > 0);
  // Someone else's evidence cannot be pulled into Priya's draft
  const other = store.allItems().find((i) => store.personOf(i) === 'Marcus Lee');
  await assert.rejects(() => draftReview({ role: 'employee', person: 'Priya Raman', claims: [{ text: 'x', itemIds: [other.id] }] }), /own evidence/);
});

test('competency parser', () => {
  assert.deepEqual(parseCompetencies('A: one\nB'), [{ name: 'A', description: 'one' }, { name: 'B', description: '' }]);
});

test('github normalisers', () => {
  const c = normaliseCommits([{ sha: 'abcdef123', html_url: 'u', author: { login: 'priya' }, commit: { message: 'fix: x\n\nbody', author: { date: '2026-03-01T00:00:00Z' } } }], 'o/r');
  assert.equal(c[0].id, 'GH-abcdef1'); assert.equal(c[0].title, 'fix: x');
  const p = normalisePulls([{ number: 5, title: 'T', body: 'B', user: { login: 'm' }, merged_at: '2026-03-02T00:00:00Z', state: 'closed', html_url: 'u' }], 'o/r');
  assert.equal(p[0].meta.status, 'merged');
});

test('jira json, adf and csv parsing', () => {
  const adf = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }] };
  assert.equal(adfToText(adf).trim(), 'Hello');
  const j = normaliseIssues([{ key: 'PAY-1', fields: { summary: 'S', status: { name: 'Done' }, assignee: { displayName: 'Priya' }, resolutiondate: '2026-03-01T00:00:00.000+0000', description: adf } }], 'https://x.atlassian.net');
  assert.equal(j[0].meta.status, 'Done'); assert.equal(j[0].url, 'https://x.atlassian.net/browse/PAY-1');
  const csv = 'Issue key,Summary,Status,Assignee,Resolved,Description\nPAY-2,"Fix, comma",Done,Marcus,17/Mar/26 3:04 PM,"line1\nline2"\n';
  const rows = parseJiraExport(csv, 'export.csv');
  assert.equal(rows[0].title, 'PAY-2: Fix, comma'); assert.ok(rows[0].date.startsWith('2026-03-17'));
});

test('slack export parsing maps user ids and ignores join messages', () => {
  const users = JSON.stringify([{ id: 'U1', name: 'priya', real_name: 'Priya Raman' }]);
  const day = JSON.stringify([{ user: 'U1', text: 'hello team', ts: '1772323200.000100' }, { subtype: 'channel_join', user: 'U1', text: 'joined', ts: '1772323201.000100' }]);
  const out = parseSlackExport([{ name: 'users.json', content: users }, { name: '2026-03-01.json', content: day }], '#payments');
  assert.equal(out.length, 1); assert.equal(out[0].author, 'Priya Raman'); assert.equal(out[0].id, 'SL-payments-1772323200.000100');
});
