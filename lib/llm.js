import { GoogleGenAI } from '@google/genai';
import { cacheGet, cacheSet, hash } from './cache.js';

export const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

// Auth modes: Vertex AI (Cloud Run service account), AI Studio key (local dev),
// or offline (deterministic heuristics, no model calls).
function createClient() {
  if (process.env.MOCK_MODE === '1' || process.env.OFFLINE === '1') return null;
  if (process.env.GOOGLE_CLOUD_PROJECT) {
    return new GoogleGenAI({
      vertexai: true,
      project: process.env.GOOGLE_CLOUD_PROJECT,
      location: process.env.GOOGLE_CLOUD_LOCATION || 'us-central1'
    });
  }
  if (process.env.GEMINI_API_KEY) return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return null;
}

export const ai = createClient();
export const mode = () => (!ai ? 'offline' : process.env.GOOGLE_CLOUD_PROJECT ? 'vertex-ai' : 'ai-studio');
export const EMBED_MODEL =
  process.env.EMBED_MODEL || (process.env.GOOGLE_CLOUD_PROJECT ? 'text-embedding-005' : 'gemini-embedding-001');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function withRetry(fn, attempts = 4) {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (err) {
      const retryable = /429|503|RESOURCE_EXHAUSTED|UNAVAILABLE/i.test(`${err.status} ${err.message}`);
      if (!retryable || i >= attempts - 1) throw err;
      await sleep(1000 * 2 ** i);
    }
  }
}

// Structured generation with a content-addressed cache.
export async function generateJson({ system, prompt, schema }) {
  const key = hash(MODEL, system, prompt, schema);
  const hit = cacheGet(key);
  if (hit) return hit;
  const res = await withRetry(() =>
    ai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: { systemInstruction: system, responseMimeType: 'application/json', responseSchema: schema, temperature: 0 }
    })
  );
  let parsed;
  try {
    parsed = JSON.parse(res.text);
  } catch {
    throw new Error('Model returned malformed JSON');
  }
  cacheSet(key, parsed);
  return parsed;
}

// Embeddings. Batches first; falls back to one text per call, because some
// Vertex embedding models accept a single input per request.
export async function embed(texts) {
  const out = [];
  const BATCH = 50;
  for (let i = 0; i < texts.length; i += BATCH) {
    const chunk = texts.slice(i, i + BATCH);
    const key = hash(EMBED_MODEL, chunk);
    let vectors = cacheGet(key);
    if (!vectors) {
      try {
        const res = await withRetry(() =>
          ai.models.embedContent({ model: EMBED_MODEL, contents: chunk, config: { taskType: 'SEMANTIC_SIMILARITY' } })
        );
        vectors = res.embeddings.map((e) => e.values);
        if (vectors.length !== chunk.length) throw new Error('embedding count mismatch');
      } catch {
        vectors = [];
        for (const t of chunk) {
          const r = await withRetry(() =>
            ai.models.embedContent({ model: EMBED_MODEL, contents: [t], config: { taskType: 'SEMANTIC_SIMILARITY' } })
          );
          vectors.push(r.embeddings[0].values);
        }
      }
      cacheSet(key, vectors);
    }
    out.push(...vectors);
  }
  return out;
}

// PDF (or other file) to text using Gemini's multimodal input.
export async function transcribe(base64, mimeType) {
  if (!ai) throw Object.assign(new Error('PDF upload needs a live Gemini mode. Paste the text instead.'), { status: 400 });
  const res = await withRetry(() =>
    ai.models.generateContent({
      model: MODEL,
      contents: [{ role: 'user', parts: [
        { inlineData: { mimeType, data: base64 } },
        { text: 'Transcribe this document to plain text, preserving headings, tables as rows, numbers and dates exactly. Output only the text.' }
      ] }],
      config: { temperature: 0 }
    })
  );
  return res.text;
}
