/**
 * public/js/api.js — fetch wrapper for the §9.1 error contract (Ticket 31).
 *
 * Every call sends an X-Request-Id and resolves to the parsed body; a failed
 * call throws an ApiError carrying the server's {code, message, details,
 * requestId}. A response that is not JSON (or a network failure) still
 * produces an ApiError — UI code only ever handles ApiError.
 */

export class ApiError extends Error {
  constructor(status, code, message, details, requestId) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details ?? [];
    this.requestId = requestId ?? null;
  }
}

async function request(method, path, body) {
  const id = crypto.randomUUID();
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        'X-Request-Id': id,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Network request failed — is the server running?', [], id);
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    // 204s and proxy pages have no JSON body; fall through.
  }

  if (!res.ok) {
    const e = data?.error ?? {};
    throw new ApiError(
      res.status,
      e.code ?? 'INTERNAL',
      e.message ?? `${res.status} ${res.statusText}`,
      e.details,
      e.requestId ?? res.headers.get('X-Request-Id') ?? id,
    );
  }
  return data;
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  put: (path, body) => request('PUT', path, body),
  patch: (path, body) => request('PATCH', path, body),
  del: (path) => request('DELETE', path),
};
