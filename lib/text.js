// Text helpers shared by extraction, verification and offline retrieval.
const STOP = new Set(('a an the of to for and or in on at by is are be been was were it its this that these those with from as ' +
  'must may can will shall should not no any all per each than more less least up within before after ' +
  'who whom which what when how do does i my me we our you your they their staff').split(' '));

export const normalise = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[*_`#>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// The verifier: a quote is accepted only if it appears verbatim (after
// whitespace, case and markdown normalisation) in the source document.
export function quoteInText(quote, text) {
  const q = normalise(quote).replace(/[.\s]+$/, '');
  return q.length >= 12 && normalise(text).includes(q);
}

const stem = (w) => w.replace(/(ly|ing|s)$/, '');

export function tokens(s) {
  return new Set(
    normalise(s)
      .replace(/[$\d.,%]+/g, ' ')
      .split(/[^a-z']+/)
      .filter((w) => w.length > 2 && !STOP.has(w))
      .map(stem)
  );
}

export function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

export function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

export function sentences(text) {
  return text
    .split(/\n+/)
    .flatMap((line) => line.replace(/^\s*[-*\d.)]+\s+/, '').split(/(?<=[.!?])\s+(?=[A-Z])/))
    .map((s) => s.trim())
    .filter((s) => s.length > 15 && !s.startsWith('#'));
}

export const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'doc';

export function isoFromAu(d) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(d || '').trim());
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : '';
}
export const auFromIso = (d) => (d ? d.split('-').reverse().join('/') : '');
