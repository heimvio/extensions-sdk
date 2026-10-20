import { Injectable, inject } from '@angular/core';
import { AuthService } from '@heimvio/zitadel-pgrst-angular/auth';
import { HEIMVIO_EXTENSION_CONFIG } from './config';
import { joinPath, toQuery } from './logic';
import { heimvioTrace } from './trace';

export type QueryValue = string | number | boolean | Array<string | number | boolean> | null | undefined;

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

/**
 * heimvio's PostgREST answers a missing permission (SQLSTATE 42501) with 401,
 * not 403 — that is no expired token, so no refresh is attempted.
 */
async function isPermissionError(res: Response): Promise<boolean> {
  try {
    const body = (await res.clone().json()) as { code?: unknown };
    return body.code === '42501';
  } catch {
    return false;
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

/**
 * Client for heimvio with the signed-in user's token. Every call carries the
 * user's JWT — the extension sees exactly what the user sees (row level
 * security decides, as for heimvio's own SPA) — and an `X-Trace-Id`.
 *
 * - `rpc/get/post` talk to PostgREST below `/api`,
 * - `sidecar(path, init)` talks to heimvio's sidecar below `/heimvio`,
 * - `backend(path, init)` talks to the extension's own backend (relative to `<base href>`).
 *
 * A 401 triggers one token refresh and one retry — except a 401 with
 * PostgREST code `42501`, which is a missing permission, not an expired token.
 */
@Injectable({ providedIn: 'root' })
export class HeimvioApi {
  private readonly auth = inject(AuthService);
  private readonly cfg = inject(HEIMVIO_EXTENSION_CONFIG);

  /** `POST /api/rpc/<name>` with `args` as JSON body. */
  rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    return this.json<T>(joinPath(this.cfg.apiBase, `rpc/${encodeURIComponent(name)}`), {
      method: 'POST',
      body: JSON.stringify(args),
      headers: { 'Content-Type': 'application/json' }
    });
  }

  /** `GET /api/<path>?<query>`, e.g. `get('property', { select: 'id,name' })`. */
  get<T>(path: string, query?: Record<string, QueryValue>): Promise<T> {
    return this.json<T>(joinPath(this.cfg.apiBase, path) + toQuery(query), { method: 'GET' });
  }

  /** `POST /api/<path>` with JSON body; `prefer` sets PostgREST's `Prefer` header (default `return=representation`). */
  post<T>(path: string, body: unknown, opts: { prefer?: string } = {}): Promise<T> {
    return this.json<T>(joinPath(this.cfg.apiBase, path), {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json', Prefer: opts.prefer ?? 'return=representation' }
    });
  }

  /** Raw call to heimvio's sidecar (`/heimvio/<path>`); the caller reads the `Response`. */
  sidecar(path: string, init: RequestInit = {}): Promise<Response> {
    return this.send(joinPath(this.cfg.sidecarBase, path), init);
  }

  /** Raw call to the extension's own backend, relative to `<base href>` (e.g. `backend('api/hello')`). */
  backend(path: string, init: RequestInit = {}): Promise<Response> {
    return this.send(path.replace(/^\/+/, ''), init);
  }

  private async json<T>(url: string, init: RequestInit): Promise<T> {
    const res = await this.send(url, init);
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
  }

  private async send(url: string, init: RequestInit, retry = true): Promise<Response> {
    const headers = new Headers(init.headers);
    const token = this.auth.token;
    if (token) headers.set('Authorization', `Bearer ${token}`);
    headers.set('X-Trace-Id', heimvioTrace.next());
    const res = await fetch(url, { ...init, headers });
    if (res.status === 401 && retry && token && !(await isPermissionError(res))) {
      try {
        await this.auth.refresh();
      } catch {
        return res;
      }
      return this.send(url, init, false);
    }
    return res;
  }
}
