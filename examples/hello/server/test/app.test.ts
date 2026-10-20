import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spaStatic } from '@heimvio/ext-sdk-node';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildApp, type WhoamiResponse } from '../src/app.js';
import { API_BASE, createMockHeimvio } from './mock-heimvio.js';

type Mock = Awaited<ReturnType<typeof createMockHeimvio>>;

describe('hello backend', () => {
  let m: Mock;
  beforeEach(async () => {
    m = await createMockHeimvio();
  });

  const app = () => buildApp({ apiBase: API_BASE, fetch: m.fetch, gateCacheMs: 0 });

  it('answers /healthz without a token and without asking heimvio', async () => {
    const res = await app().request('/healthz');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok', slug: 'hello' });
    expect(m.seen).toHaveLength(0);
  });

  it('refuses /api/whoami without a token', async () => {
    const res = await app().request('/api/whoami');
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
  });

  it('calls whoami as the signed-in user and returns it with the organisation', async () => {
    const t = await m.token();
    const res = await app().request('/api/whoami', {
      headers: { Authorization: `Bearer ${t}`, 'X-Trace-Id': 'hellohello12.3' }
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as WhoamiResponse;
    expect(body).toEqual({
      whoami: { user_id: 'user-1', org_id: 'org-1', roles: ['property_manager'], display_name: 'Erika Muster' },
      extension: { slug: 'hello', org_name: 'WEG Musterstraße', expires_at: '2099-01-01T00:00:00Z' },
      trace_id: 'hellohello12.3'
    });

    const gate = m.seen.find(s => s.url.startsWith(`${API_BASE}/heimvio/ext/me`));
    expect(gate?.url).toBe(`${API_BASE}/heimvio/ext/me?slug=hello`);
    const rpc = m.seen.find(s => s.url === `${API_BASE}/api/rpc/whoami`);
    expect(rpc).toMatchObject({ method: 'POST', authorization: `Bearer ${t}`, traceId: 'hellohello12.3' });
  });

  it('answers 403 not_installed and does not call whoami when the organisation has no active installation', async () => {
    m.state.me = { ...m.state.me, installed: false, expires_at: null };
    const t = await m.token();
    const res = await app().request('/api/whoami', { headers: { Authorization: `Bearer ${t}` } });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'not_installed', slug: 'hello' });
    expect(m.seen.some(s => s.url.endsWith('/api/rpc/whoami'))).toBe(false);
  });

  it('passes heimvio\'s refusal on as 502 with code and hint, not as a crash', async () => {
    m.state.whoamiStatus = 401;
    const t = await m.token();
    const res = await app().request('/api/whoami', { headers: { Authorization: `Bearer ${t}` } });
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'heimvio_error', status: 401, code: '42501', hint: 'not_allowed' });
  });

  it('serves the frontend with <base href> = HEIMVIO_EXT_BASE, but never for /api/*', async () => {
    const root = mkdtempSync(join(tmpdir(), 'hello-web-'));
    writeFileSync(join(root, 'index.html'), '<!doctype html><html><head><base href="/"></head><body></body></html>');
    writeFileSync(join(root, 'main-ABCDEFGH.js'), 'console.log(1)');
    const a = app();
    a.use('*', spaStatic({ root, base: '/apps/hello/' }));

    const index = await a.request('/some/deep/link');
    expect(index.status).toBe(200);
    expect(await index.text()).toContain('<base href="/apps/hello/">');

    const js = await a.request('/main-ABCDEFGH.js');
    expect(js.headers.get('Content-Type')).toMatch(/javascript/);

    const api = await a.request('/api/unknown', { headers: { Authorization: `Bearer ${await m.token()}` } });
    expect(api.status).toBe(404);
  });
});
