// GitHub connector (live, REST API). Public repos work without a token; a
// personal access token raises the rate limit and allows private repos.
// The token is used for the request only and is never stored or logged.
const REPO_RE = /^[\w.-]+\/[\w.-]+$/;
const MAX_PAGES = 5;

export function normaliseCommits(commits, repo) {
  return commits.map((c) => ({
    id: `GH-${c.sha.slice(0, 7)}`, source: 'github', type: 'commit', date: c.commit.author?.date || c.commit.committer?.date,
    author: c.author?.login || c.commit.author?.name || 'unknown',
    title: c.commit.message.split('\n')[0], text: c.commit.message, url: c.html_url, project: repo, meta: {}
  }));
}

export function normalisePulls(pulls, repo) {
  return pulls.map((p) => ({
    id: `GH-PR${p.number}`, source: 'github', type: 'pr', date: p.merged_at || p.closed_at || p.updated_at || p.created_at,
    author: p.user?.login || 'unknown', title: `PR #${p.number}: ${p.title}`, text: `${p.title}\n${p.body || ''}`,
    url: p.html_url, project: repo, meta: { status: p.merged_at ? 'merged' : p.state }
  }));
}

async function gh(url, token) {
  const res = await fetch(url, {
    headers: { accept: 'application/vnd.github+json', 'user-agent': 'synapseos', ...(token ? { authorization: `Bearer ${token}` } : {}) }
  });
  if (res.status === 403 || res.status === 429) throw Object.assign(new Error('GitHub rate limit reached. Add a personal access token and retry.'), { status: 502 });
  if (res.status === 404) throw Object.assign(new Error('Repository not found, or the token cannot see it.'), { status: 404 });
  if (!res.ok) throw Object.assign(new Error(`GitHub returned ${res.status}`), { status: 502 });
  return res.json();
}

export async function fetchGithub({ repo, token, since }) {
  if (!REPO_RE.test(repo || '')) throw Object.assign(new Error('Repository must look like owner/name'), { status: 400 });
  const sinceIso = since ? new Date(since).toISOString() : undefined;
  const out = [];
  let truncated = false;
  for (const [kind, build, norm] of [
    ['commits', (p) => `https://api.github.com/repos/${repo}/commits?per_page=100&page=${p}${sinceIso ? `&since=${sinceIso}` : ''}`, normaliseCommits],
    ['pulls', (p) => `https://api.github.com/repos/${repo}/pulls?state=all&sort=updated&direction=desc&per_page=100&page=${p}`, normalisePulls]
  ]) {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const rows = await gh(build(page), token);
      out.push(...norm(rows, repo).filter((i) => !sinceIso || i.date >= sinceIso));
      if (rows.length < 100) break;
      if (page === MAX_PAGES) truncated = true;
    }
    void kind;
  }
  return { items: out, truncated };
}
