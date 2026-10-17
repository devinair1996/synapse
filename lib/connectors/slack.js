// Slack connector: file upload of a channel export (day files are JSON arrays of
// messages), optionally with users.json to map user ids to names. Live Slack API
// access needs app approval, so it is the production path rather than the demo.
export function parseSlackExport(files, channel) {
  const arrays = files.map((f) => ({ name: f.name, data: JSON.parse(f.content) })).filter((f) => Array.isArray(f.data));
  const usersFile = arrays.find((f) => f.data.length && f.data.every((u) => u.id && !u.ts && (u.name || u.real_name)));
  const users = new Map((usersFile?.data || []).map((u) => [u.id, u.real_name || u.profile?.real_name || u.name]));
  const ch = String(channel || 'channel').replace(/^#/, '').slice(0, 60);
  return arrays.filter((f) => f !== usersFile).flatMap((f) => f.data)
    .filter((m) => m.ts && m.text && (!m.subtype || m.subtype === 'thread_broadcast'))
    .map((m) => ({
      id: `SL-${ch}-${m.ts}`, source: 'slack', type: 'message', date: new Date(Number(m.ts) * 1000).toISOString(),
      author: m.user_profile?.real_name || m.user_name || users.get(m.user) || m.user || 'unknown',
      title: `#${ch}: ${m.text.slice(0, 80)}`, text: m.text, url: '', project: '', meta: { channel: ch }
    }));
}
