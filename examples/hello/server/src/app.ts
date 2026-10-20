import { createExtensionApp, HeimvioApiError, type ExtensionAppOptions, type ExtensionHonoEnv } from '@heimvio/ext-sdk-node';
import type { Hono } from 'hono';

/** Answer of `GET /api/whoami`. */
export interface WhoamiResponse {
  /** `POST /api/rpc/whoami` of heimvio, called as the signed-in user. */
  whoami: unknown;
  /** From the installation gate (`/heimvio/ext/me`). */
  extension: { slug: string; org_name: string | null; expires_at: string | null };
  /** The trace id of this request — the same id is in heimvio's logs. */
  trace_id: string;
}

/**
 * The hello backend: `GET /healthz` (from the SDK) and `GET /api/whoami`,
 * which asks heimvio who the user is — with the user's own token, so heimvio
 * answers exactly what the user may see.
 */
export function buildApp(opts: ExtensionAppOptions = {}): Hono<ExtensionHonoEnv> {
  const app = createExtensionApp({ slug: 'hello', ...opts });

  app.get('/api/whoami', async c => {
    const whoami = await c.get('heimvio').rpc<unknown>('whoami');
    const ext = c.get('extension');
    const body: WhoamiResponse = {
      whoami,
      extension: { slug: ext.slug, org_name: ext.org_name, expires_at: ext.expires_at },
      trace_id: c.get('traceId')
    };
    return c.json(body);
  });

  app.onError((err, c) => {
    // heimvio's error (status, code, hint) for the caller; nothing about the backend's internals.
    if (err instanceof HeimvioApiError) {
      return c.json({ error: 'heimvio_error', status: err.status, code: err.code, hint: err.hint }, 502);
    }
    console.error(err);
    return c.json({ error: 'internal_error' }, 500);
  });

  return app;
}
