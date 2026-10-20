# Example extension: hello

The smallest complete heimvio extension. It shows **"Hello &lt;user&gt;
(&lt;organisation&gt;)"**, the user's roles and the remaining time of the
installation, and has a button that calls the extension's own backend, which
in turn asks heimvio `whoami` **as the signed-in user**.

| Part | Where | What it uses |
|---|---|---|
| Frontend (Angular, standalone, signals, zoneless) | [`web/src`](web/src) | `provideHeimvioExtension({ slug: 'hello' })`, `<hv-ext-shell>`, `HeimvioExtension.me()`, `HeimvioApi.backend('api/whoami')` |
| Backend (Node, Hono) | [`server/src`](server/src) | `createExtensionApp({ slug: 'hello' })`, `c.get('heimvio').rpc('whoami')`, `serveExtension(app, { staticRoot })` |
| Image | [`Dockerfile`](Dockerfile) | one image, port 8080, `GET /healthz`, runs as `node`, nothing written at runtime |

Read [docs/EXTENSIONS.md](../../docs/EXTENSIONS.md) first — it is the
contract this example implements, including the security model.

## Routes of the container

| Route | Auth | Answer |
|---|---|---|
| `GET /healthz` | none | `{"status":"ok","slug":"hello"}` |
| `GET /api/whoami` | user token + installation gate | `{"whoami": {…}, "extension": {"slug","org_name","expires_at"}, "trace_id": "…"}`; `401 unauthorized`, `403 not_installed`, `502 gate_unavailable` (from the SDK), `502 heimvio_error` with heimvio's `status`, `code`, `hint` |
| everything else (`GET`) | none | the Angular app; `index.html` with `<base href>` = `HEIMVIO_EXT_BASE` |

The proxy strips `/apps/hello` before a request reaches the container, so
`https://<heimvio>/apps/hello/api/whoami` arrives as `/api/whoami`.

## Environment

Set by heimvio's host when it starts the container; the image carries the
same values as defaults.

| Variable | Default | Meaning |
|---|---|---|
| `HEIMVIO_EXT_SLUG` | `hello` | slug the extension is registered under |
| `HEIMVIO_EXT_BASE` | `/apps/hello/` | public base path, written into `<base href>` |
| `HEIMVIO_API_BASE` | `http://heimvio-api:8081` | heimvio's API as seen from the extensions network |
| `PORT` | `8080` | listen port |

## Develop

From the repository root (needs a token with `read:packages` in `~/.npmrc`,
see the root README):

```bash
npm install
npm run build          # SDK packages, then this example (dist/web + dist/server/main.mjs)
npm test               # includes server/test (backend against an in-process heimvio) and web/src/**/*.spec.ts
```

Start the backend with the built frontend against a heimvio development
stack:

```bash
cd examples/hello
HEIMVIO_EXT_SLUG=hello HEIMVIO_API_BASE=https://<your heimvio dev host> PORT=8080 npm start
curl localhost:8080/healthz
```

`HEIMVIO_API_BASE` must serve `/jwks.json`, `/api/*` and `/heimvio/*` — in
heimvio's stacks that is the `heimvio-api:8081` site of the proxy, reachable
from the `extensions` network. The **browser** part only works on heimvio's
origin under `/apps/hello/`, because it shares heimvio's session: run the
container in heimvio's development stack (network `extensions`, container
name `ext-hello`) so that the proxy routes `/apps/hello/` to it, then open
`https://<your heimvio dev host>/apps/hello/` while signed in. Without an
active installation for your organisation the page says "Nicht
freigeschaltet"; a property manager starts it in heimvio under
Einstellungen → Organisation → Erweiterungen.

## Build the image

The build context is the repository root, because the SDK packages are
built from source. The npm token is passed **only** as a BuildKit secret:

```bash
GITHUBPACKAGESTOKEN=$(gh auth token) docker build \
  --secret id=npm_token,env=GITHUBPACKAGESTOKEN \
  -f examples/hello/Dockerfile -t ext-hello .

docker run --rm -p 8080:8080 --read-only --cap-drop ALL ext-hello
curl localhost:8080/healthz
```

CI: [`.github/workflows/hello-image.yml`](../../.github/workflows/hello-image.yml)
builds and pushes `ghcr.io/heimvio/ext-hello` on a tag `hello-v<version>` or
by hand, and prints the digest. It reads `@heimvio/*` with the secret
`GITHUBPACKAGESTOKEN` if set, otherwise with the run's `GITHUB_TOKEN` (which
then needs read access to those packages in their package settings).
[`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) builds and tests
all packages and builds this image without pushing.

## Register (heimvio operator)

Only heimvio's operator registers an extension, and only **by digest**:

```sql
SELECT api.extension_register(
  'hello',                                         -- slug
  'Hello',                                         -- name
  'Beispiel-Erweiterung: zeigt Benutzer, Organisation und Rollen.',
  'ghcr.io/heimvio/ext-hello@sha256:<digest>',     -- from the workflow summary
  '0.1.0',                                         -- version
  60,                                              -- default minutes
  240                                              -- maximum minutes
);
```

After that, a property manager can start it for their organisation; heimvio's
host starts the container `ext-hello` within about a minute.
