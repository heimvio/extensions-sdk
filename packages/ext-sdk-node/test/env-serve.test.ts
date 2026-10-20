import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hono } from 'hono';
import { beforeAll, describe, expect, it } from 'vitest';
import { readExtensionEnv } from '../src/env.js';
import { rewriteBaseHref, spaStatic } from '../src/serve.js';
import { isTraceId, traceIdFrom } from '../src/trace.js';

describe('readExtensionEnv', () => {
  it('applies the container contract defaults', () => {
    expect(readExtensionEnv({ HEIMVIO_EXT_SLUG: 'hello' })).toEqual({
      slug: 'hello',
      base: '/apps/hello/',
      apiBase: 'http://heimvio-api:8081',
      port: 8080
    });
  });
  it('takes explicit values', () => {
    expect(
      readExtensionEnv({ HEIMVIO_EXT_SLUG: 'hello', HEIMVIO_EXT_BASE: '/x', HEIMVIO_API_BASE: 'http://localhost:9/', PORT: '3000' })
    ).toEqual({ slug: 'hello', base: '/x/', apiBase: 'http://localhost:9', port: 3000 });
  });
  it('refuses a missing or invalid slug', () => {
    expect(() => readExtensionEnv({})).toThrow(/HEIMVIO_EXT_SLUG/);
    expect(() => readExtensionEnv({ HEIMVIO_EXT_SLUG: 'Bad' })).toThrow();
  });
});

describe('trace ids', () => {
  it('keeps valid ids and replaces others', () => {
    expect(traceIdFrom('abcdef.1')).toBe('abcdef.1');
    expect(isTraceId(traceIdFrom('x'))).toBe(true);
    expect(traceIdFrom('evil\nline')).not.toContain('\n');
  });
});

describe('rewriteBaseHref', () => {
  it('replaces an existing base tag', () => {
    expect(rewriteBaseHref('<head><base href="/"></head>', '/apps/hello/')).toBe('<head><base href="/apps/hello/"></head>');
  });
  it('inserts one when missing', () => {
    expect(rewriteBaseHref('<html><head><title>x</title></head>', '/apps/hello/')).toContain('<head>\n  <base href="/apps/hello/">');
  });
});

describe('spaStatic', () => {
  let root: string;
  let app: Hono;
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'ext-sdk-'));
    await mkdir(join(root, 'assets'));
    await writeFile(join(root, 'index.html'), '<html><head><base href="/"></head><body>app</body></html>');
    await writeFile(join(root, 'main-ABCDEFGH.js'), 'console.log(1)');
    await writeFile(join(root, 'assets', 'a.json'), '{"a":1}');
    await writeFile(join(tmpdir(), 'ext-sdk-secret.txt'), 'secret');
    app = new Hono();
    app.get('/api/known', c => c.json({ ok: true }));
    app.use('*', spaStatic({ root, base: '/apps/hello/' }));
  });

  it('serves files with a content type', async () => {
    const res = await app.request('/main-ABCDEFGH.js');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('javascript');
    expect(res.headers.get('Cache-Control')).toContain('immutable');
    expect(await (await app.request('/assets/a.json')).json()).toEqual({ a: 1 });
  });

  it('falls back to index.html with the public base href', async () => {
    for (const p of ['/', '/some/route']) {
      const res = await app.request(p);
      expect(res.status).toBe(200);
      expect(await res.text()).toContain('<base href="/apps/hello/">');
    }
  });

  it('does not answer API paths or missing assets with index.html', async () => {
    expect((await app.request('/api/known')).status).toBe(200);
    expect((await app.request('/api/unknown')).status).toBe(404);
    expect((await app.request('/missing.js')).status).toBe(404);
  });

  it('does not leave the root', async () => {
    const res = await app.request('/%2e%2e/ext-sdk-secret.txt');
    expect(await res.text()).not.toContain('secret');
  });
});
