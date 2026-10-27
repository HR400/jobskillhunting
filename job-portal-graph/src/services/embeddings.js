/**
 * src/services/embeddings.js — real embedding provider (Ticket 55, plan §11.1).
 *
 * Only a configured provider is used. There is no local fallback: a missing
 * provider or key makes the feature report `unavailable`, and a failed API call
 * is a 503, never a pseudo-vector. Dimensions are fixed because the vector
 * index is created with them.
 */
import { config } from '../config.js';
import { Errors } from '../lib/errors.js';

export const EMBEDDING_DIMENSIONS = 1536;
const MODEL = 'text-embedding-3-small';
const ENDPOINT = 'https://api.openai.com/v1/embeddings';

/** @returns {string|null} reason the feature cannot run, or null when it can. */
export function embeddingsUnavailableReason() {
  if (!config.EMBEDDINGS_PROVIDER) {
    return 'Set EMBEDDINGS_PROVIDER to enable semantic search.';
  }
  if (config.EMBEDDINGS_PROVIDER !== 'openai') {
    return `Unsupported EMBEDDINGS_PROVIDER "${config.EMBEDDINGS_PROVIDER}"; only openai is implemented.`;
  }
  if (!config.EMBEDDINGS_API_KEY) {
    return 'Set EMBEDDINGS_API_KEY to enable semantic search.';
  }
  return null;
}

export async function embed(text) {
  const reason = embeddingsUnavailableReason();
  if (reason) throw Errors.unavailable(reason);

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.EMBEDDINGS_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ model: MODEL, input: String(text ?? '') }),
  });
  if (!res.ok) {
    throw Errors.unavailable(`The embedding provider returned HTTP ${res.status}.`);
  }

  const body = await res.json();
  const vector = body?.data?.[0]?.embedding;
  if (!Array.isArray(vector) || vector.length !== EMBEDDING_DIMENSIONS) {
    throw Errors.unavailable('The embedding provider returned an unexpected vector.');
  }
  return vector;
}
