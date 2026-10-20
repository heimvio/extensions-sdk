import { Hono } from 'hono';
import { exportJWK, generateKeyPair, SignJWT, type JWK } from 'jose';
import type { ExtensionMe, FetchLike } from '@heimvio/ext-sdk-node';

export const API_BASE = 'http://heimvio-api:8081';

/**
 * In-process stand-in for heimvio's API in the extensions network
 * (`/jwks.json`, `/api/rpc/whoami`, `/heimvio/ext/me`) — same pattern as
 * packages/ext-sdk-node/test/mock-heimvio.ts. No sockets; requests are recorded.
 */
export async function createMockHeimvio() {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk: JWK = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };

  const seen: Array<{ method: string; url: string; authorization: string | null; traceId: string | null }> = [];
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
    whoamiStatus: 200
  };

  const app = new Hono();
  app.use('*', async (c, next) => {
    seen.push({
      method: c.req.method,
      url: c.req.url,
      authorization: c.req.header('Authorization') ?? null,
      traceId: c.req.header('X-Trace-Id') ?? null
    });
    await next();
  });
  app.get('/jwks.json', c => c.json({ keys: [jwk] }));
  app.get('/heimvio/ext/me', c => c.json({ ...state.me, slug: c.req.query('slug') ?? '' }));
  app.post('/api/rpc/whoami', c => {
    if (state.whoamiStatus !== 200) {
      return c.json({ code: '42501', message: 'permission denied', hint: 'not_allowed', details: null }, state.whoamiStatus as 401);
    }
    return c.json({ user_id: 'user-1', org_id: 'org-1', roles: state.me.roles, display_name: state.me.display_name });
  });

  const fetchImpl: FetchLike = async (input, init) => {
    const req = input instanceof Request ? input : new Request(String(input), init);
    return app.fetch(req);
  };

  async function token(sub = 'user-1') {
    return new SignJWT({ scope: 'openid' })
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setSubject(sub)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey);
  }

  return { fetch: fetchImpl, seen, state, token };
}
