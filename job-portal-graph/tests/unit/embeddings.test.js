/**
 * TEST ONLY — tests/unit/embeddings.test.js (Ticket 55)
 *
 * The embedding provider is the real OpenAI API; there is no local fallback.
 * A stub stands in for the network so the request shape and the failure paths
 * are checked without contacting the provider.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { embed, embeddingsUnavailableReason, EMBEDDING_DIMENSIONS } from '../../src/services/embeddings.js';
import { config } from '../../src/config.js';

const original = {
  provider: config.EMBEDDINGS_PROVIDER,
  key: config.EMBEDDINGS_API_KEY,
};

afterEach(() => {
  vi.unstubAllGlobals();
  config.EMBEDDINGS_PROVIDER = original.provider;
  config.EMBEDDINGS_API_KEY = original.key;
});

describe('embeddings (Ticket 55)', () => {
  it('explains every missing or unsupported configuration', () => {
    config.EMBEDDINGS_PROVIDER = '';
    expect(embeddingsUnavailableReason()).toMatch(/EMBEDDINGS_PROVIDER/);

    config.EMBEDDINGS_PROVIDER = 'cohere';
    config.EMBEDDINGS_API_KEY = 'key';
    expect(embeddingsUnavailableReason()).toMatch(/only openai/);

    config.EMBEDDINGS_PROVIDER = 'openai';
    config.EMBEDDINGS_API_KEY = '';
    expect(embeddingsUnavailableReason()).toMatch(/EMBEDDINGS_API_KEY/);

    config.EMBEDDINGS_API_KEY = 'key';
    expect(embeddingsUnavailableReason()).toBeNull();
  });

  it('posts the job text to the provider and returns its vector', async () => {
    config.EMBEDDINGS_PROVIDER = 'openai';
    config.EMBEDDINGS_API_KEY = 'test-key';
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: [{ embedding: Array(EMBEDDING_DIMENSIONS).fill(0.5) }] }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const vector = await embed('Graph engineer');
    expect(vector).toHaveLength(EMBEDDING_DIMENSIONS);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/embeddings');
    expect(init.headers.authorization).toBe('Bearer test-key');
    expect(JSON.parse(init.body)).toEqual({
      model: 'text-embedding-3-small',
      input: 'Graph engineer',
    });
  });

  it('fails loudly instead of inventing a vector', async () => {
    config.EMBEDDINGS_PROVIDER = 'openai';
    config.EMBEDDINGS_API_KEY = 'test-key';

    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401 })));
    await expect(embed('x')).rejects.toMatchObject({ code: 'UNAVAILABLE' });

    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ data: [{ embedding: [1, 2] }] }) })));
    await expect(embed('x')).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  });
});
