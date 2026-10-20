# @heimvio/ext-sdk-node

Node building block for the backend of a heimvio extension.

```ts
import { createExtensionApp, serveExtension } from '@heimvio/ext-sdk-node';

const app = createExtensionApp();
app.get('/api/hello', async c => c.json(await c.get('heimvio').rpc('whoami')));
serveExtension(app, { staticRoot: 'public' });
```

- `createExtensionApp()` — Hono app with `GET /healthz`, token verification against `${HEIMVIO_API_BASE}/jwks.json` and the installation gate on `/api/*`.
- `asUser(jwt)` — calls heimvio's PostgREST (`/api`) and sidecar (`/heimvio`) as the signed-in user, forwarding `X-Trace-Id`.
- `serveExtension()` — port 8080, serves the built frontend with `<base href>` from `HEIMVIO_EXT_BASE`.

Contract and security model: [docs/EXTENSIONS.md](https://github.com/heimvio/extensions-sdk/blob/main/docs/EXTENSIONS.md).
