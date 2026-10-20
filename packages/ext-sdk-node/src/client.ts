import { DEFAULT_API_BASE } from './env.js';
import { newTraceId } from './trace.js';

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
export type QueryValue = string | number | boolean | Array<string | number | boolean> | null | undefined;

/** Answer of `GET /heimvio/ext/me?slug=<slug>` (= `api.extension_me`). */
export interface ExtensionMe {
  slug: string;
  installed: boolean;
  expires_at: string | null;
  org_id: string | null;
  org_name: string | null;
  user_id: string | null;
  display_name: string | null;
  roles: string[];
}

/** Error of a heimvio call; `code`/`hint` come from PostgREST (`hint` carries the machine-readable reason). */
export class HeimvioApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
    readonly code: string | null = null,
    readonly hint: string | null = null
  ) {
    super(errorMessage(status, body));
    this.name = 'HeimvioApiError';
  }
}

function errorMessage(status: number, body: unknown): string {
  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>;
    const m = b['message'] ?? b['error'];
    if (typeof m === 'string') return `${status}: ${m}`;
  }
  return `heimvio request failed with status ${status}`;
}

export interface HeimvioClient {
  /** `POST <apiBase>/api/rpc/<name>` with `args` as JSON body. */
  rpc<T>(name: string, args?: Record<string, unknown>): Promise<T>;
  /** `GET <apiBase>/api/<path>?<query>`. */
  get<T>(path: string, query?: Record<string, QueryValue>): Promise<T>;
  /** `POST <apiBase>/api/<path>` with JSON body; `prefer` default `return=representation`. */
  post<T>(path: string, body: unknown, opts?: { prefer?: string }): Promise<T>;
  /** Raw call to heimvio's sidecar: `<apiBase>/heimvio/<path>`. */
  sidecar(path: string, init?: RequestInit): Promise<Response>;
  /** `GET /heimvio/ext/me?slug=` — who the user is and whether the org has the extension installed. */
  extensionMe(slug: string): Promise<ExtensionMe>;
  /** The trace id this client sends. */
  readonly traceId: string;
}

export interface AsUserOptions {
  apiBase?: string;
  traceId?: string;
  fetch?: FetchLike;
}

function join(base: string, path: string): string {
  return base.replace(/\/+$/, '') + '/' + path.replace(/^\/+/, '');
}

function toQuery(query?: Record<string, QueryValue>): string {
  if (!query) return '';
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === null || v === undefined) continue;
    if (Array.isArray(v)) v.forEach(x => p.append(k, String(x)));
    else p.append(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

/**
 * A heimvio client acting as the user whose JWT is passed in: every call
 * carries `Authorization: Bearer <jwt>` and `X-Trace-Id`, so row level
 * security sees the user (and nothing else), and heimvio's trace timeline
 * shows the call next to the user's own requests.
 */
export function asUser(jwt: string, opts: AsUserOptions = {}): HeimvioClient {
  const apiBase = (opts.apiBase ?? process.env['HEIMVIO_API_BASE'] ?? DEFAULT_API_BASE).replace(/\/+$/, '');
  const traceId = opts.traceId ?? newTraceId();
  const doFetch: FetchLike = opts.fetch ?? fetch;

  const send = (url: string, init: RequestInit = {}): Promise<Response> => {
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${jwt}`);
    headers.set('X-Trace-Id', traceId);
    return doFetch(url, { ...init, headers });
  };

  const json = async <T>(url: string, init: RequestInit): Promise<T> => {
    const res = await send(url, init);
    const text = await res.text();
    let body: unknown = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
    if (!res.ok) {
      const b = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
      throw new HeimvioApiError(
        res.status,
        body,
        typeof b['code'] === 'string' ? b['code'] : null,
        typeof b['hint'] === 'string' ? b['hint'] : null
      );
    }
    return body as T;
  };

  const api = join(apiBase, 'api');
  const sidecarBase = join(apiBase, 'heimvio');

  return {
    traceId,
    rpc: <T>(name: string, args: Record<string, unknown> = {}) =>
      json<T>(join(api, `rpc/${encodeURIComponent(name)}`), {
        method: 'POST',
        body: JSON.stringify(args),
        headers: { 'Content-Type': 'application/json' }
      }),
    get: <T>(path: string, query?: Record<string, QueryValue>) => json<T>(join(api, path) + toQuery(query), { method: 'GET' }),
    post: <T>(path: string, body: unknown, o: { prefer?: string } = {}) =>
      json<T>(join(api, path), {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json', Prefer: o.prefer ?? 'return=representation' }
      }),
    sidecar: (path: string, init?: RequestInit) => send(join(sidecarBase, path), init),
    extensionMe: (slug: string) => json<ExtensionMe>(join(sidecarBase, `ext/me?slug=${encodeURIComponent(slug)}`), { method: 'GET' })
  };
}
