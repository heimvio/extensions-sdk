import { beforeEach, describe, expect, it } from 'vitest';
import { asUser, HeimvioApiError } from '../src/client.js';
import { API_BASE, createMockHeimvio } from './mock-heimvio.js';

type Mock = Awaited<ReturnType<typeof createMockHeimvio>>;

describe('asUser', () => {
  let m: Mock;
  beforeEach(async () => {
    m = await createMockHeimvio();
  });

  const client = (m: Mock) => asUser('jwt-1', { apiBase: `${API_BASE}/`, fetch: m.fetch, traceId: 'trace12345.1' });

  it('calls an RPC with JSON body, JWT and trace id', async () => {
    const who = await client(m).rpc<{ user_id: string }>('whoami', { p: 1 });
    expect(who.user_id).toBe('user-1');
    expect(m.seen[0]).toMatchObject({
      method: 'POST',
      url: `${API_BASE}/api/rpc/whoami`,
      authorization: 'Bearer jwt-1',
      traceId: 'trace12345.1',
      body: '{"p":1}'
    });
  });

  it('reads a table with query parameters', async () => {
    const rows = await client(m).get<Array<{ q: string }>>('property', { select: 'id,name', skip: undefined });
    expect(rows[0]?.q).toBe('id,name');
    expect(m.seen[0]?.url).toBe(`${API_BASE}/api/property?select=id%2Cname`);
  });

  it('posts with Prefer: return=representation', async () => {
    const rows = await client(m).post<Array<{ text: string }>>('note', { text: 'x' });
    expect(rows).toEqual([{ text: 'x' }]);
    expect(m.seen[0]?.prefer).toBe('return=representation');
  });

  it('turns a PostgREST error into HeimvioApiError with hint', async () => {
    const err = await client(m).rpc('fails').catch(e => e);
    expect(err).toBeInstanceOf(HeimvioApiError);
    expect(err).toMatchObject({ status: 400, code: '22023', hint: 'invalid_minutes' });
  });

  it('talks to the sidecar below /heimvio and returns the raw response', async () => {
    const res = await client(m).sidecar('/raw');
    expect(await res.text()).toBe('sidecar says hi');
    expect(m.seen[0]).toMatchObject({ url: `${API_BASE}/heimvio/raw`, authorization: 'Bearer jwt-1' });
  });

  it('asks /heimvio/ext/me', async () => {
    const me = await client(m).extensionMe('hello');
    expect(me).toMatchObject({ slug: 'hello', installed: true, org_name: 'WEG Musterstraße' });
  });

  it('generates a valid trace id when none is given', () => {
    expect(asUser('x', { apiBase: API_BASE, fetch: m.fetch }).traceId).toMatch(/^[a-z0-9]{12}\.1$/);
  });
});
