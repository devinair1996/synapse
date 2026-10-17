// Document connector: uploaded text, markdown or PDF (PDF via Gemini). Long
// documents are split into sections so retrieval and citations stay specific.
import { slug } from '../text.js';

export function docToItems({ title, author, date, text }) {
  const name = String(title || 'Untitled').slice(0, 120);
  const base = `DOC-${slug(name)}`;
  const paras = String(text).split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const sections = [];
  let cur = '';
  for (const p of paras) {
    if (cur && cur.length + p.length > 1500) { sections.push(cur); cur = ''; }
    cur += (cur ? '\n\n' : '') + p;
  }
  if (cur) sections.push(cur);
  return sections.map((s, i) => ({
    id: sections.length > 1 ? `${base}-${i + 1}` : base, source: 'drive', type: 'doc',
    date: date || new Date().toISOString(), author: author || 'unknown',
    title: sections.length > 1 ? `${name} (part ${i + 1})` : name, text: s, url: '', project: '', meta: {}
  }));
}
