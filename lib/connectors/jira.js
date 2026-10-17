// Jira connector. Live via the REST API with an API token, or an uploaded
// export (JSON in API shape, or CSV).
const BASE_RE = /^https:\/\/[a-z0-9-]+\.atlassian\.net$/i;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

// Atlassian Document Format to plain text.
export function adfToText(node) {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (node.type === 'text') return node.text || '';
  const inner = (node.content || []).map(adfToText).join(node.type === 'paragraph' || node.type === 'heading' ? '' : ' ');
  return ['paragraph', 'heading', 'listItem'].includes(node.type) ? `${inner}\n` : inner;
}

export function normaliseIssues(issues, baseUrl = '') {
  return issues.map((i) => {
    const f = i.fields || {};
    return {
      id: i.key, source: 'jira', type: 'ticket',
      date: f.resolutiondate || f.updated || f.created,
      author: f.assignee?.displayName || f.reporter?.displayName || 'unknown',
      title: `${i.key}: ${f.summary || ''}`,
      text: `${f.summary || ''}\n${adfToText(f.description)}`.trim(),
      url: baseUrl ? `${baseUrl}/browse/${i.key}` : '', project: f.project?.key || i.key.split('-')[0],
      meta: { status: f.status?.name || '', issueType: f.issuetype?.name || '' }
    };
  });
}

export async function fetchJira({ baseUrl, email, token, jql }) {
  if (!BASE_RE.test(baseUrl || '')) throw Object.assign(new Error('Base URL must look like https://yoursite.atlassian.net'), { status: 400 });
  if (!email || !token) throw Object.assign(new Error('Email and API token are required'), { status: 400 });
  const auth = Buffer.from(`${email}:${token}`).toString('base64');
  const issues = [];
  let nextPageToken;
  let truncated = false;
  for (let page = 0; page < 5; page++) {
    const res = await fetch(`${baseUrl}/rest/api/3/search/jql`, {
      method: 'POST',
      headers: { authorization: `Basic ${auth}`, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        jql: jql || 'updated >= -270d ORDER BY updated DESC', maxResults: 100, nextPageToken,
        fields: ['summary', 'status', 'assignee', 'reporter', 'created', 'updated', 'resolutiondate', 'description', 'issuetype', 'project']
      })
    });
    if (res.status === 401 || res.status === 403) throw Object.assign(new Error('Jira rejected the credentials.'), { status: 502 });
    if (!res.ok) throw Object.assign(new Error(`Jira returned ${res.status}`), { status: 502 });
    const data = await res.json();
    issues.push(...data.issues);
    nextPageToken = data.nextPageToken;
    if (!nextPageToken) break;
    if (page === 4) truncated = true;
  }
  return { items: normaliseIssues(issues, baseUrl), truncated };
}

function parseDate(s) {
  if (!s) return '';
  const direct = new Date(s);
  if (!Number.isNaN(direct.getTime()) && /\d{4}/.test(s)) return direct.toISOString();
  const m = /(\d{1,2})\/([A-Za-z]{3})\/(\d{2,4})/.exec(s); // Jira CSV: 17/Oct/26 3:04 PM
  if (!m) return '';
  const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  return new Date(Date.UTC(y, MONTHS.indexOf(m[2].toLowerCase()), Number(m[1]))).toISOString();
}

export function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some(Boolean));
}

export function parseJiraExport(content, filename = '') {
  if (filename.toLowerCase().endsWith('.csv') || !/^\s*[[{]/.test(content)) {
    const [header, ...rows] = parseCsv(content);
    const col = (...names) => header.findIndex((h) => names.includes(h.trim().toLowerCase()));
    const c = { key: col('issue key', 'key'), sum: col('summary'), st: col('status'), asg: col('assignee'), rep: col('reporter'), cr: col('created'), up: col('updated'), rs: col('resolved'), de: col('description'), ty: col('issue type') };
    if (c.key < 0 || c.sum < 0) throw Object.assign(new Error('CSV needs "Issue key" and "Summary" columns'), { status: 400 });
    return rows.map((r) => ({
      id: r[c.key], source: 'jira', type: 'ticket', date: parseJiraDate(r, c),
      author: r[c.asg] || r[c.rep] || 'unknown', title: `${r[c.key]}: ${r[c.sum]}`, text: `${r[c.sum]}\n${r[c.de] || ''}`.trim(),
      url: '', project: String(r[c.key]).split('-')[0], meta: { status: r[c.st] || '', issueType: r[c.ty] || '' }
    }));
  }
  const json = JSON.parse(content);
  return normaliseIssues(Array.isArray(json) ? json : json.issues || []);
}
const parseJiraDate = (r, c) => parseDate(r[c.rs]) || parseDate(r[c.up]) || parseDate(r[c.cr]);
