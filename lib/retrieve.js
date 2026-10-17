// Metadata filter first (done in store.filterItems), then semantic ranking over
// the filtered set. Embeddings live, token overlap offline.
import { ai, embed } from './llm.js';
import { tokens, jaccard, cosine } from './text.js';

const vectors = new Map(); // item id -> embedding
const MAX_EMBED = 2000;

export const simText = (i) => `${i.source} ${i.type}: ${i.title}. ${i.text.slice(0, 500)}`;
export const SCORE_FLOOR = ai ? 0.55 : 0.02;

export async function rank(query, candidates, k) {
  if (!candidates.length) return { ranked: [], capped: false };
  if (!ai) {
    const q = tokens(query);
    const ranked = candidates.map((item) => ({ item, score: jaccard(q, tokens(simText(item))) }))
      .filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, k);
    return { ranked, capped: false };
  }
  const pool = candidates.slice(0, MAX_EMBED);
  const missing = pool.filter((i) => !vectors.has(i.id));
  if (missing.length) (await embed(missing.map(simText))).forEach((v, n) => vectors.set(missing[n].id, v));
  const [qv] = await embed([query]);
  const ranked = pool.map((item) => ({ item, score: cosine(qv, vectors.get(item.id)) }))
    .sort((a, b) => b.score - a.score).slice(0, k);
  return { ranked, capped: candidates.length > MAX_EMBED };
}
