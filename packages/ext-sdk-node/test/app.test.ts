import { beforeEach, describe, expect, it } from 'vitest';
import { createExtensionApp } from '../src/app.js';
import { TRACE_ID_PATTERN } from '../src/trace.js';
import { API_BASE, createMockHeimvio } from './mock-heimvio.js';

type Mock = Awaited<ReturnType<typeof createMockHeimvio>>;

function build(m: Mock, extra: Parameters<typeof createExtensionApp>[0] = {}) {
  const app = createExtensionApp({ slug: 'hello', apiBase: API_BASE, fetch: m.fetch, ...extra });
  app.get('/api/hello', async c => {
    const who = await c.get('heimvio').rpc<{ user_id: string }>('whoami');
    return c.json({ who, org: c.get('extension').org_name, sub: c.get('user').sub, trace: c.get('traceId') });
  });
  app.get('/public', c => c.text('public'));
  return app;
}

describe('createExtensionApp', () => {
  let m: Mock;
  beforeEach(async () => {
    m = await createMockHeimvio();
  });

  it('answers /healthz without a token', async () => {
    const res = await build(m).request('/healthz');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok', slug: 'hello' });
    expect(m.seen).toHaveLength(0);
  });

  it('leaves paths outside /api/* alone', async () => {
    const res = await build(m).request('/public');
    expect(res.status).toBe(200);
  });

  it('rejects a request without token with 401', async () => {
    const res = await build(m).request('/api/hello');
    expect(res.status).toBe(401);
    expect(res.headers.get('WWW-Authenticate')).toBe('Bearer');
    expect(await res.json()).toEqual({ error: 'unauthorized' });
  });

  it('rejects a token signed by another key, an expired token and garbage', async () => {
    const app = build(m);
    for (const t of [
      await m.token({ key: 'other' }),
      await m.token({ exp: Math.floor(Date.now() / 1000) - 3600 }),
      'not-a-jwt'
    ]) {
      const res = await app.request('/api/hello', { headers: { Authorization: `Bearer ${t}` } });
      expect(res.status).toBe(401);
    }
  });

  it('fetches the key set from <apiBase>/jwks.json', async () => {
    const t = await m.token();
    await build(m).request('/api/hello', { headers: { Authorization: `Bearer ${t}` } });
    expect(m.seen.some(s => s.url === `${API_BASE}/jwks.json`)).toBe(true);
  });

  it('lets an installed user through and calls heimvio as that user', async () => {
    const t = await m.token();
    const res = await build(m).request('/api/hello', {
      headers: { Authorization: `Bearer ${t}`, 'X-Trace-Id': 'abcdefabcdef.7' }
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { who: { user_id: string }; org: string; sub: string; trace: string };
    expect(body).toMatchObject({ who: { user_id: 'user-1' }, org: 'WEG Musterstraße', sub: 'user-1', trace: 'abcdefabcdef.7' });
    expect(res.headers.get('X-Trace-Id')).toBe('abcdefabcdef.7');

    const gate = m.seen.find(s => s.url.startsWith(`${API_BASE}/heimvio/ext/me`));
    expect(gate?.url).toBe(`${API_BASE}/heimvio/ext/me?slug=hello`);
    expect(gate?.authorization).toBe(`Bearer ${t}`);
    expect(gate?.traceId).toBe('abcdefabcdef.7');

    const rpc = m.seen.find(s => s.url === `${API_BASE}/api/rpc/whoami`);
    expect(rpc?.method).toBe('POST');
    expect(rpc?.authorization).toBe(`Bearer ${t}`);
    expect(rpc?.traceId).toBe('abcdefabcdef.7');
  });

  it('replaces an invalid incoming trace id instead of forwarding it', async () => {
    const t = await m.token();
    const res = await build(m).request('/api/hello', {
      headers: { Authorization: `Bearer ${t}`, 'X-Trace-Id': 'bad id with spaces <x>' }
    });
    const trace = res.headers.get('X-Trace-Id') ?? '';
    expect(trace).toMatch(TRACE_ID_PATTERN);
    expect(m.seen.find(s => s.url.endsWith('/api/rpc/whoami'))?.traceId).toBe(trace);
  });

  it('answers 403 not_installed when the organisation has no active installation', async () => {
    m.state.me = { ...m.state.me, installed: false, expires_at: null };
    const t = await m.token();
    const res = await build(m).request('/api/hello', { headers: { Authorization: `Bearer ${t}` } });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'not_installed', slug: 'hello' });
    expect(m.seen.some(s => s.url.endsWith('/api/rpc/whoami'))).toBe(false);
  });

  it('trusts heimvio\'s clock: installed with an expiry in the past of the local clock still passes', async () => {
    m.state.me = { ...m.state.me, expires_at: '2000-01-01T00:00:00Z' };
    const t = await m.token();
    const res = await build(m).request('/api/hello', { headers: { Authorization: `Bearer ${t}` } });
    expect(res.status).toBe(200);
  });

  it('answers 502 when the gate cannot ask heimvio', async () => {
    m.state.meStatus = 500;
    const t = await m.token();
    const res = await build(m).request('/api/hello', { headers: { Authorization: `Bearer ${t}` } });
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'gate_unavailable' });
  });

  it('passes a 401 of heimvio through', async () => {
    m.state.meStatus = 401;
    const t = await m.token();
    const res = await build(m).request('/api/hello', { headers: { Authorization: `Bearer ${t}` } });
    expect(res.status).toBe(401);
  });

  it('caches the gate answer per token', async () => {
    let now = 1_000_000;
    const app = build(m, { gateCacheMs: 10_000, now: () => now });
    const t = await m.token();
    const h = { headers: { Authorization: `Bearer ${t}` } };
    await app.request('/api/hello', h);
    await app.request('/api/hello', h);
    expect(m.seen.filter(s => s.url.includes('/heimvio/ext/me'))).toHaveLength(1);
    now += 10_001;
    await app.request('/api/hello', h);
    expect(m.seen.filter(s => s.url.includes('/heimvio/ext/me'))).toHaveLength(2);
  });

  it('can run without the gate', async () => {
    m.state.me = { ...m.state.me, installed: false };
    const t = await m.token();
    const app = createExtensionApp({ slug: 'hello', apiBase: API_BASE, fetch: m.fetch, gate: false });
    app.get('/api/plain', c => c.json({ sub: c.get('user').sub }));
    const res = await app.request('/api/plain', { headers: { Authorization: `Bearer ${t}` } });
    expect(res.status).toBe(200);
    expect(m.seen.some(s => s.url.includes('/heimvio/ext/me'))).toBe(false);
  });

  it('refuses an invalid slug', () => {
    expect(() => createExtensionApp({ slug: 'Postgres', apiBase: API_BASE })).toThrow();
    expect(() => createExtensionApp({ slug: '../x', apiBase: API_BASE })).toThrow();
  });
});
