// Plain-code verification of model output against the retrieved evidence.
const NUM_RE = /[$]?\d[\d,]*(?:\.\d+)?%?/g;
const auDate = (iso) => iso.slice(0, 10).split('-').reverse().join('/');

// Drops cited ids that are not in the allowed set, drops claims left with no
// valid citation, and flags numbers that appear in none of the cited items
// (a number may also equal the count of cited items).
export function verifyClaims(claims, allowed) {
  const dropped = { badIds: 0, noCitation: 0 };
  let flaggedNumbers = 0;
  const out = [];
  for (const c of claims || []) {
    const ids = [...new Set((c.itemIds || []).filter((id) => {
      const ok = allowed.has(id);
      if (!ok) dropped.badIds++;
      return ok;
    }))];
    if (!ids.length || !String(c.text || '').trim()) { dropped.noCitation++; continue; }
    const hay = ids.map((id) => { const i = allowed.get(id); return `${i.title} ${i.text} ${i.date.slice(0, 10)} ${auDate(i.date)}`; }).join(' ').replace(/,/g, '');
    const unverified = (String(c.text).match(NUM_RE) || [])
      .map((n) => n.replace(/,/g, ''))
      .filter((n) => (n.length >= 2 || /[$%]/.test(n)) && !hay.includes(n) && Number(n) !== ids.length);
    if (unverified.length) flaggedNumbers++;
    out.push({ ...c, itemIds: ids, unverifiedNumbers: unverified });
  }
  return { claims: out, dropped, flaggedNumbers };
}
