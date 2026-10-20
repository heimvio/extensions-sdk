import { Hono } from 'hono';
import type { JWTVerifyGetKey } from 'jose';
import { requireInstalled, requireUser, createTokenVerifier, type ExtensionHonoEnv } from './auth.js';
import type { FetchLike } from './client.js';
import { DEFAULT_API_BASE, SLUG_PATTERN } from './env.js';

export interface ExtensionAppOptions {
  /** The extension's slug; default `HEIMVIO_EXT_SLUG`. */
  slug?: string;
  /** heimvio's API as seen from the extensions network; default `HEIMVIO_API_BASE`, then `http://heimvio-api:8081`. */
  apiBase?: string;
  /** Paths that require a user token (and the gate); default `/api/*`. */
  protectedPaths?: string[];
  /** Installation gate on the protected paths; default true. */
  gate?: boolean;
  /** Cache of the gate answer per token (ms); default 10 000. */
  gateCacheMs?: number;
  /** Optional `iss`/`aud` checks of the access token. */
  issuer?: string | string[];
  audience?: string | string[];
  /** Overrides for tests: key set and fetch (used for the key set, the gate and `asUser`). */
  jwks?: JWTVerifyGetKey;
  fetch?: FetchLike;
  now?: () => number;
}

/**
 * The backend of an extension as a Hono app:
 *
 * - `GET /healthz` (no auth) — the container health check,
 * - on `protectedPaths` (default `/api/*`): the user's token is verified
 *   against `<apiBase>/jwks.json`, then the installation gate asks
 *   `/heimvio/ext/me`. Handlers find `c.get('user')`, `c.get('extension')`
 *   and `c.get('heimvio')` (a client acting as the user).
 *
 * ```ts
 * const app = createExtensionApp({ slug: 'hello' });
 * app.get('/api/hello', async c => c.json(await c.get('heimvio').rpc('whoami')));
 * serveExtension(app, { staticRoot: 'public' });
 * ```
 */
export function createExtensionApp(opts: ExtensionAppOptions = {}): Hono<ExtensionHonoEnv> {
  const slug = opts.slug ?? process.env['HEIMVIO_EXT_SLUG'] ?? '';
  if (!SLUG_PATTERN.test(slug)) throw new Error(`invalid extension slug ${JSON.stringify(slug)}`);
  const apiBase = (opts.apiBase ?? process.env['HEIMVIO_API_BASE'] ?? DEFAULT_API_BASE).replace(/\/+$/, '');

  const verify = createTokenVerifier({
    apiBase,
    jwks: opts.jwks,
    fetch: opts.fetch,
    issuer: opts.issuer,
    audience: opts.audience
  });

  const app = new Hono<ExtensionHonoEnv>();
  app.get('/healthz', c => c.json({ status: 'ok', slug }));

  for (const path of opts.protectedPaths ?? ['/api/*']) {
    app.use(path, requireUser(verify, { apiBase, fetch: opts.fetch }));
    if (opts.gate !== false) app.use(path, requireInstalled({ slug, cacheMs: opts.gateCacheMs, now: opts.now }));
  }
  return app;
}
