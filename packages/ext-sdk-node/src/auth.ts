import type { MiddlewareHandler } from 'hono';
import { createRemoteJWKSet, customFetch, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose';
import { asUser, HeimvioApiError, type ExtensionMe, type FetchLike, type HeimvioClient } from './client.js';
import { traceIdFrom } from './trace.js';

export interface ExtensionUser {
  /** The raw access token, forwarded to heimvio unchanged. */
  jwt: string;
  sub: string;
  claims: JWTPayload;
}

export type ExtensionVariables = {
  user: ExtensionUser;
  /** heimvio client acting as this user. */
  heimvio: HeimvioClient;
  /** Answer of `/heimvio/ext/me`, set by the gate. */
  extension: ExtensionMe;
  traceId: string;
};

export type ExtensionHonoEnv = { Variables: ExtensionVariables };

export interface VerifierOptions {
  apiBase: string;
  /** Key set override (tests, or a key set from elsewhere); default `<apiBase>/jwks.json`. */
  jwks?: JWTVerifyGetKey;
  fetch?: FetchLike;
  issuer?: string | string[];
  audience?: string | string[];
  clockToleranceSec?: number;
}

export type TokenVerifier = (jwt: string) => Promise<JWTPayload>;

/**
 * Verifies Zitadel access tokens against the key set heimvio publishes for
 * the extensions network (`<apiBase>/jwks.json`). Keys are cached by jose and
 * re-fetched on an unknown `kid` (key rotation).
 */
export function createTokenVerifier(o: VerifierOptions): TokenVerifier {
  const keys =
    o.jwks ??
    createRemoteJWKSet(new URL(`${o.apiBase.replace(/\/+$/, '')}/jwks.json`), {
      cooldownDuration: 30_000,
      cacheMaxAge: 10 * 60_000,
      ...(o.fetch ? { [customFetch]: o.fetch } : {})
    });
  return async (jwt: string) => {
    const { payload } = await jwtVerify(jwt, keys, {
      issuer: o.issuer,
      audience: o.audience,
      clockTolerance: o.clockToleranceSec ?? 30
    });
    return payload;
  };
}

function bearer(header: string | undefined): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return m?.[1] ?? null;
}

/**
 * 401 unless the request carries a valid heimvio user token. Sets `user`,
 * `traceId` and `heimvio` (a client acting as that user).
 */
export function requireUser(verify: TokenVerifier, client: { apiBase: string; fetch?: FetchLike }): MiddlewareHandler<ExtensionHonoEnv> {
  return async (c, next) => {
    const traceId = traceIdFrom(c.req.header('X-Trace-Id'));
    c.set('traceId', traceId);
    c.header('X-Trace-Id', traceId);
    const jwt = bearer(c.req.header('Authorization'));
    if (!jwt) {
      c.header('WWW-Authenticate', 'Bearer');
      return c.json({ error: 'unauthorized' }, 401);
    }
    let claims: JWTPayload;
    try {
      claims = await verify(jwt);
    } catch {
      c.header('WWW-Authenticate', 'Bearer error="invalid_token"');
      return c.json({ error: 'unauthorized' }, 401);
    }
    if (typeof claims.sub !== 'string' || !claims.sub) {
      return c.json({ error: 'unauthorized' }, 401);
    }
    c.set('user', { jwt, sub: claims.sub, claims });
    c.set('heimvio', asUser(jwt, { apiBase: client.apiBase, traceId, fetch: client.fetch }));
    await next();
    return;
  };
}

export interface GateOptions {
  slug: string;
  /** How long one answer of `/heimvio/ext/me` is reused for the same token (ms); default 10 000, 0 = never. */
  cacheMs?: number;
  now?: () => number;
}

/**
 * The installation gate (after `requireUser`): 403 `{error:'not_installed'}`
 * unless the user's current organisation has the extension installed (an
 * expired installation is not installed). Answers are cached per token for
 * `cacheMs`, so an expiry shows up at most that late. A product gate, not a security boundary —
 * heimvio's API applies row level security to the user's token either way.
 */
export function requireInstalled(o: GateOptions): MiddlewareHandler<ExtensionHonoEnv> {
  const cacheMs = o.cacheMs ?? 10_000;
  const now = o.now ?? Date.now;
  const cache = new Map<string, { at: number; me: ExtensionMe }>();
  return async (c, next) => {
    const user = c.get('user');
    let me: ExtensionMe | undefined;
    const hit = cache.get(user.jwt);
    if (hit && now() - hit.at < cacheMs) me = hit.me;
    if (!me) {
      try {
        me = await c.get('heimvio').extensionMe(o.slug);
      } catch (e) {
        if (e instanceof HeimvioApiError && e.status === 401) return c.json({ error: 'unauthorized' }, 401);
        return c.json({ error: 'gate_unavailable' }, 502);
      }
      if (cacheMs > 0) {
        if (cache.size > 1000) cache.clear();
        cache.set(user.jwt, { at: now(), me });
      }
    }
    // `installed` is computed by heimvio with its own clock (which tests and
    // scenario environments may shift) — the local clock does not judge it.
    if (!me.installed) {
      return c.json({ error: 'not_installed', slug: o.slug }, 403);
    }
    c.set('extension', me);
    await next();
    return;
  };
}
