// Fictional demo evidence: a small payments team over ~9 months. Dates are
// relative to "now" so the standup and manager views always have recent items.
// Planted for testing: outcome evidence (latency, duplicate charges), buried
// mentoring work in Slack, and no mentoring evidence at all for Marcus.
import { slug } from './text.js';

export const DEMO_PEOPLE = `Priya Raman: priya, praman
Marcus Lee: marcus, mlee
Lena Novak: lena, lnovak
Sam Okafor: sam, sokafor`;

export const DEMO_COMPETENCIES = `Delivery and impact: shipped work with a measurable outcome for customers or the business
Technical quality: reliability, testing, security, sound engineering
Collaboration and communication: working across teams, documentation, clear updates
Mentoring and leadership: mentor, coach, guide, teach, onboard, review others' work, lead incidents or workstreams`;

const ago = (days) => new Date(Date.now() - days * 86_400_000).toISOString();
const hex = (s) => [...s].reduce((h, c) => ((h * 31 + c.charCodeAt(0)) >>> 0), 7).toString(16).padStart(7, '0').slice(0, 7);

const gh = (d, author, title, text = '') => ({ id: `GH-${hex(title + d)}`, source: 'github', type: 'commit', date: ago(d), author, title, text: text || title, url: '', project: 'payments', meta: {} });
const pr = (d, author, n, title, body = '', status = 'merged') => ({ id: `GH-PR${n}`, source: 'github', type: 'pr', date: ago(d), author, title: `PR #${n}: ${title}`, text: `${title}\n${body}`, url: '', project: 'payments', meta: { status } });
const jira = (d, author, key, summary, status, body = '') => ({ id: key, source: 'jira', type: 'ticket', date: ago(d), author, title: `${key}: ${summary}`, text: `${summary}\n${body}`.trim(), url: '', project: 'payments', meta: { status } });
const slack = (d, author, ch, n, text) => ({ id: `SL-${ch}-${n}`, source: 'slack', type: 'message', date: ago(d), author, title: `#${ch}: ${text.slice(0, 80)}`, text, url: '', project: '', meta: { channel: ch } });
const doc = (d, author, title, text) => ({ id: `DOC-${slug(title)}`, source: 'drive', type: 'doc', date: ago(d), author, title, text, url: '', project: 'payments', meta: {} });

export const DEMO_ITEMS = [
  // GitHub
  pr(250, 'priya', 41, 'Migrate invoice service to Postgres 15', 'Reduced p95 invoice generation latency from 800ms to 320ms in load tests. Rollout plan in the design doc.'),
  gh(245, 'priya', 'fix: connection pool exhaustion under burst load'),
  pr(190, 'priya', 58, 'Add refresh-token rotation', 'Closes PAY-104. Addresses a finding from the security review.'),
  gh(188, 'priya', 'test(auth): cover token expiry edge cases'),
  pr(120, 'priya', 77, 'Rate limit middleware for the public API', 'Per-key limits, configurable per plan.'),
  gh(60, 'priya', 'docs: runbook for payment retries'),
  pr(30, 'priya', 103, 'Idempotency keys for payment retries', 'Prevents duplicate charges on retry. Double-charge support tickets fell from 14 in the quarter before the fix to 2 in the quarter after (see PAY-131).'),
  gh(5, 'priya', 'fix: retry backoff jitter'),
  pr(220, 'marcus', 44, 'Bump redis client to 5.x', 'Staging verified. Production cluster still on 6.2 so rollout is gated on DevOps sign-off.'),
  pr(150, 'marcus', 63, 'Fix invoice rounding to 2dp', 'Closes PAY-111.'),
  pr(100, 'marcus', 81, 'Usage CSV export', 'First version of the monthly usage export.'),
  gh(40, 'marcus', 'chore: dependency update batch'),
  pr(3, 'marcus', 112, 'Usage export: pagination for large accounts', 'Needed for accounts with more than 50k rows.', 'open'),
  gh(200, 'lena', 'feat(reports): monthly usage report skeleton'),
  pr(90, 'lena', 79, 'Dashboard accessibility fixes', 'Keyboard navigation and contrast fixes on the usage dashboard.'),
  gh(2, 'lena', 'docs: refresh onboarding guide'),
  // Jira
  jira(255, 'priya', 'PAY-90', 'Postgres 15 migration', 'Done', 'Migrate the invoice service database.'),
  jira(215, 'marcus', 'PAY-95', 'Upgrade redis client', 'Done'),
  jira(185, 'priya', 'PAY-104', 'OAuth refresh-token rotation', 'Done'),
  jira(148, 'marcus', 'PAY-111', 'Invoice rounding bug', 'Done'),
  jira(60, 'lena', 'PAY-121', 'Update onboarding docs', 'Done'),
  jira(35, 'priya', 'PAY-131', 'Investigate duplicate charge reports', 'Done', 'Root cause was missing idempotency on retry. Remediation in PR #103.'),
  jira(6, 'priya', 'PAY-109', 'Rate-limit policy for the public API', 'In Progress', 'Waiting on the security token-scope review.'),
  jira(4, 'lena', 'PAY-118', 'Monthly usage CSV export', 'In Review'),
  jira(8, 'marcus', 'PAY-140', 'Usage export for accounts over 50k rows', 'In Progress'),
  // Slack
  slack(250, 'priya', 'payments', 1, 'Migration cutover done. p95 invoice latency is now about 320ms versus 800ms before. Thanks Marcus for reviewing the rollback plan.'),
  slack(140, 'priya', 'eng-help', 1, 'Happy to mentor Jo on the retry logic, pairing tomorrow. I wrote a walkthrough of how our retry and backoff code works.'),
  slack(135, 'priya', 'eng-help', 2, "Reviewed Jo's first PR and left detailed comments on error handling and testing patterns."),
  slack(70, 'lena', 'eng-help', 3, 'Walked the three new starters through repo setup and wrote the onboarding guide.'),
  slack(110, 'marcus', 'security', 1, 'Pen-test finding on token scope. I am proposing scoped tokens and will write an RFC.'),
  slack(45, 'marcus', 'payments', 2, 'Usage export is blocked on the rate-limit decision. Waiting on the security review.'),
  slack(50, 'sam', 'payments', 3, 'Reminder: a key client needs the usage export by the end of the quarter.'),
  slack(33, 'priya', 'incidents', 1, 'Incident: duplicate charges for about 40 customers. Root cause is missing idempotency on retry. I will lead the postmortem.'),
  slack(32, 'priya', 'incidents', 2, 'Postmortem published and remediation PR #103 is up for review.'),
  slack(3, 'lena', 'payments', 4, 'PR #112 has had no reviewer for 2 days. Can someone pick it up?'),
  slack(1, 'priya', 'payments', 5, 'Blocked on the security token-scope review for the rate-limit policy. Security says next week.'),
  // Drive docs
  doc(262, 'priya', 'Postgres 15 Migration Design Doc', 'Goal: remove connection and query bottlenecks in invoice generation.\n\nPlan: staged migration with a rollback path reviewed by the payments team.\n\nResult: p95 invoice generation latency dropped from 800ms to 320ms in load tests and held after cutover.'),
  doc(31, 'priya', 'Payment Retry Incident Postmortem', 'Summary: about 40 customers were charged twice after payment retries.\n\nRoot cause: retries lacked idempotency keys.\n\nActions: idempotency keys added in PR #103, affected customers refunded.\n\nOutcome: no recurrence since the fix.'),
  doc(3, 'lena', 'Onboarding Guide', 'How to set up the payments repo, run tests and ship a change. Written for new starters after the March intake.'),
  doc(150, 'sam', 'Q2 Planning Notes', 'Priya owns the reliability workstream. Marcus owns security remediation. Lena owns reporting and onboarding materials.')
];
