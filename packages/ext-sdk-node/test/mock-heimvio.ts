import { Hono } from 'hono';
import { exportJWK, generateKeyPair, SignJWT, type JWK } from 'jose';
import type { ExtensionMe, FetchLike } from '../src/client.js';

export const API_BASE = 'http://heimvio-api:8081';

export interface Seen {
  method: string;
  url: string;
  authorization: string | null;
  traceId: string | null;
  prefer: string | null;
  body: string;
}

/**
 * In-process stand-in for heimvio's API in the extensions network
 * (`/jwks.json`, `/api/*`, `/heimvio/*`). No sockets: `fetch` calls the Hono
 * app directly, and every request is recorded.
 */
export async function createMockHeimvio() {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk: JWK = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
  const other = await generateKeyPair('RS256');

  const seen: Seen[] = [];
  const state = {
    me: {
      slug: 'hello',
      installed: true,
      expires_at: '2099-01-01T00:00:00Z',
      org_id: 'org-1',
      org_name: 'WEG Musterstraße',
      user_id: 'user-1',
      display_name: 'Erika Muster',
      roles: ['property_manager']
    } as ExtensionMe,
    meStatus: 200
  };

  const app = new Hono();
  app.use('*', async (c, next) => {
    seen.push({
      method: c.req.method,
      url: c.req.url,
      authorization: c.req.header('Authorization') ?? null,
      traceId: c.req.header('X-Trace-Id') ?? null,
      prefer: c.req.header('Prefer') ?? null,
      body: c.req.method === 'GET' ? '' : await c.req.raw.clone().text()
    });
    await next();
  });
  app.get('/jwks.json', c => c.json({ keys: [jwk] }));
  app.get('/heimvio/ext/me', c => {
    if (state.meStatus !== 200) return c.json({ error: 'boom' }, state.meStatus as 500);
    return c.json({ ...state.me, slug: c.req.query('slug') ?? '' });
  });
  app.post('/api/rpc/whoami', c => c.json({ user_id: 'user-1', org_id: 'org-1', roles: ['property_manager'] }));
  app.post('/api/rpc/fails', c =>
    c.json({ code: '22023', message: 'invalid minutes', hint: 'invalid_minutes', details: null }, 400)
  );
  app.get('/api/property', c => c.json([{ id: 'p1', name: 'Haus', q: c.req.query('select') }]));
  app.post('/api/note', async c => {
    const row = (await c.req.json()) as Record<string, unknown>;
    return c.body(JSON.stringify([row]), 201, { 'Content-Type': 'application/json' });
  });
  app.get('/heimvio/raw', c => c.text('sidecar says hi'));

  const fetchImpl: FetchLike = async (input, init) => {
    const req = input instanceof Request ? input : new Request(String(input), init);
    return app.fetch(req);
  };

  async function token(opts: { sub?: string; exp?: string | number; key?: 'good' | 'other'; kid?: string } = {}) {
    const key = opts.key === 'other' ? other.privateKey : privateKey;
    return new SignJWT({ scope: 'openid' })
      .setProtectedHeader({ alg: 'RS256', kid: opts.kid ?? 'k1' })
      .setSubject(opts.sub ?? 'user-1')
      .setIssuedAt()
      .setIssuer('http://zitadel.test')
      .setExpirationTime(opts.exp ?? '5m')
      .sign(key);
  }

  return { fetch: fetchImpl, seen, state, token };
}
