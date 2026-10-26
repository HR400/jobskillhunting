/**
 * TEST ONLY — tests/unit/frontend.test.js (Ticket 31)
 *
 * The browser API client (fetch stubbed) and the view store, before any page
 * exists to exercise them.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

const { api, ApiError } = await import('../../public/js/api.js');
const store = await import('../../public/js/store.js');

afterEach(() => {
  vi.unstubAllGlobals();
  store.setState({ hypothetical: [], selection: null, hover: null, mode: 'match' });
});

function jsonResponse(status, body, headers = {}) {
  return {
    ok: status < 400,
    status,
    statusText: 'x',
    headers: { get: (k) => headers[k] ?? null },
    json: () => (body === undefined ? Promise.reject(new Error('no body')) : Promise.resolve(body)),
  };
}

describe('api client (public/js/api.js)', () => {
  it('resolves to the parsed body and sends JSON headers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ok: 1 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('crypto', { randomUUID: () => 'req-1' });

    expect(await api.post('/auth/login', { email: 'a@b.c' })).toEqual({ ok: 1 });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ email: 'a@b.c' }));
    expect(init.headers['X-Request-Id']).toBe('req-1');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.credentials).toBe('same-origin');
  });

  it('maps the §9.1 error contract to an ApiError with the requestId', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(404, {
      error: { code: 'NOT_FOUND', message: 'Job not found.', requestId: 'srv-1' },
    })));
    const err = await api.get('/jobs/missing').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 404, code: 'NOT_FOUND', message: 'Job not found.', requestId: 'srv-1' });
  });

  it('falls back to INTERNAL with the echoed header when the body is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(500, undefined, { 'X-Request-Id': 'srv-2' })));
    const err = await api.get('/x').catch((e) => e);
    expect(err).toMatchObject({ status: 500, code: 'INTERNAL', requestId: 'srv-2' });
  });

  it('survives a network failure (no response object at all)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('failed to fetch')));
    const err = await api.get('/x').catch((e) => e);
    expect(err).toMatchObject({ status: 0, code: 'NETWORK' });
  });

  it('handles 204 responses (logout) without throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(204, undefined)));
    await expect(api.post('/auth/logout')).resolves.toBeNull();
  });
});

describe('store (public/js/store.js)', () => {
  it('merges patches, notifies subscribers and supports unsubscribe', () => {
    const seen = [];
    const unsubscribe = store.subscribe((s) => seen.push(s.mode));
    store.setState({ mode: 'whatif' });
    unsubscribe();
    store.setState({ mode: 'match' });
    expect(store.getState().mode).toBe('match');
    expect(seen).toEqual(['whatif']);
  });

  it('toggles and resets the hypothetical skill list', () => {
    store.toggleHypothetical({ skill_key: 'node.js', proficiency: 5, years: 1 });
    expect(store.getState().hypothetical).toEqual([{ skill_key: 'node.js', proficiency: 5, years: 1 }]);
    store.toggleHypothetical({ skill_key: 'node.js', proficiency: 4, years: 2 }); // off
    expect(store.getState().hypothetical).toEqual([]);
    store.toggleHypothetical({ skill_key: 'sql', proficiency: 3, years: 0 }); // on
    store.toggleHypothetical({ skill_key: 'sql', proficiency: 4, years: 1 }); // off again
    expect(store.getState().hypothetical).toEqual([]);
    store.resetHypothetical();
    expect(store.getState().hypothetical).toEqual([]);
  });
});
