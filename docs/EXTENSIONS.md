# heimvio extensions — contract and guide

An **extension** is a web app that runs on heimvio's own origin under
`https://heimvio.de/apps/<slug>/`, is signed in with the **same user** as
heimvio, and talks to heimvio only through heimvio's two public REST entry
points: PostgREST (`/api/*`) and the heimvio sidecar (`/heimvio/*`).

An extension is one Docker image containing an Angular frontend and a small
Node backend. heimvio starts the container while at least one organisation has
the extension switched on, and removes it afterwards. Extensions are **tools
you start for a while** (one hour by default), not permanent services.

This document is the complete contract. It describes only what an extension
needs — not heimvio's whole API.

- [1. Security model](#1-security-model)
- [2. Life cycle](#2-life-cycle)
- [3. Container contract](#3-container-contract)
- [4. Sign-in](#4-sign-in)
- [5. Talking to heimvio](#5-talking-to-heimvio)
- [6. Angular SDK](#6-angular-sdk)
- [7. Node SDK](#7-node-sdk)
- [8. Development setup](#8-development-setup)
- [9. Limits](#9-limits)

## 1. Security model

Read this first; it is deliberately blunt.

- **An extension has exactly the rights of the signed-in user — all of them.**
  It runs on the same origin as heimvio, so its JavaScript can read the
  user's session (tokens live in `localStorage` of the origin). Every call it
  makes to heimvio carries the user's token, and heimvio's row level security
  decides what it may read and write — exactly as for heimvio's own app.
  heimvio cannot tell an extension's request from the user's own, and there is
  no extra permission model for extensions.
- **The trust boundary is the registration.** Only heimvio's operator
  registers an extension, only as an image **pinned by digest**
  (`ghcr.io/heimvio/…@sha256:…`) from a fixed registry. An extension is
  therefore exactly as trustworthy as heimvio's own frontend, and is reviewed
  as such. There is no community or self-service registration.
- **Extensions have internet access.** The container runs in its own network
  that reaches heimvio's API (`heimvio-api:8081`, see below) and the internet,
  but not heimvio's database, identity provider or other internal services. An
  extension *can* therefore send data it reads to other services. That is the
  same trust as above: whoever is registered is trusted with the user's data.
- **No background access.** An extension acts only while a user is signed in
  and only with that user's token. It has no identity of its own, cannot work
  at night, cannot receive webhooks and write to heimvio on its own behalf.
- **The installation gate is a product gate, not a security boundary.** The
  SDKs refuse to work for an organisation that has not switched the extension
  on (see §2). That keeps the product honest; the protection of the data is
  row level security, which applies either way.
- **The container is locked down by the host**, not by the image: read-only
  root filesystem, no volumes, all Linux capabilities dropped, memory and CPU
  limits, a fixed container name `ext-<slug>`. Do not rely on writing to disk
  (use `/tmp` only if the host provides a tmpfs — do not assume it) and keep
  no state between requests: the container is removed when the last
  installation ends.

## 2. Life cycle

| Step | Who | What happens |
|---|---|---|
| Register | heimvio operator | Slug, name, description, image digest, default and maximum minutes, visibility. |
| Switch on | property manager of an organisation | "Start for 60 minutes" in heimvio's settings → the organisation has an **active installation** until `expires_at`. Advisory board members see it read-only; owners and tenants do not see installations. |
| Run | heimvio host | Within about a minute the container `ext-<slug>` is started; it runs while **at least one** organisation has an active installation. |
| Extend / stop | property manager | Extend up to the extension's maximum, or stop early. |
| Expire | — | After `expires_at` the installation is no longer active; the SDK gate answers "not installed" immediately (heimvio's clock decides, not the container's), and the host removes the container once no organisation is active. |
| Disable | heimvio operator | Ends all installations of the extension. |

One container serves **all** organisations: every request carries the user's
token, and the database separates the organisations. An extension therefore
must not keep per-organisation state in memory beyond a single request (a
short cache keyed by token is fine).

## 3. Container contract

| Item | Value |
|---|---|
| Image | One image, published to `ghcr.io/heimvio/<name>`, registered **by digest**. |
| Port | The container listens on **8080** (HTTP, no TLS). |
| Path | The proxy maps `https://heimvio.de/apps/<slug>/…` to `http://ext-<slug>:8080/…` — the prefix `/apps/<slug>` is **stripped**. |
| `HEIMVIO_EXT_SLUG` | The slug, `^[a-z0-9][a-z0-9-]{1,30}$`. |
| `HEIMVIO_EXT_BASE` | `/apps/<slug>/` — the public base path. Write it into `<base href>` of `index.html` (the Node SDK does that when it serves the frontend). |
| `HEIMVIO_API_BASE` | `http://heimvio-api:8081` — heimvio's API as seen from the extensions network. It serves only `/api/*` (PostgREST), `/heimvio/*` (sidecar) and `/jwks.json` (keys to verify user tokens). |
| Health check | `GET /healthz` → `200`, no authentication. |
| Filesystem | Read-only; no volumes. |
| Network | Own network with internet access; heimvio is reachable only via `HEIMVIO_API_BASE`. |

The browser never talks to `heimvio-api:8081`: the frontend uses the
**relative** paths `/api` and `/heimvio` on heimvio's origin; only the
extension's backend uses `HEIMVIO_API_BASE`.

When the container is not running, `https://heimvio.de/apps/<slug>/` answers
with heimvio's own page "extension is not started" (HTTP 503).

## 4. Sign-in

An extension uses heimvio's OIDC client and session — there is no separate
client, no separate redirect URI and no login page of its own.

1. The Angular SDK loads heimvio's runtime configuration from
   **`/config.json`** of the origin (absolute path; the app itself lives below
   `/apps/<slug>/`).
2. It looks for heimvio's session in `localStorage` of the origin. A signed-in
   heimvio user is therefore signed in to the extension without any redirect.
   An expired access token is refreshed with the stored refresh token.
3. Without a session the SDK starts the authorization code flow (PKCE) with
   heimvio's **existing** redirect URI `<origin>/callback` and the current
   path below `/apps/<slug>/` as OAuth `state`. heimvio's identity provider
   redirects to heimvio's `/callback`; heimvio's app completes the code flow
   and navigates back to the extension.

### The `state` contract (for heimvio's `/callback`)

This is what heimvio's app has to implement; the SDK side is fixed.

- The extension calls `OAuthService.initCodeFlow(returnPath)`
  (angular-oauth2-oidc 20) with `redirect_uri = <origin>/callback` and the
  `client_id` from `/config.json`. `returnPath` is a same-origin path, for
  example `/apps/hello/` or `/apps/hello/report?year=2026#top`.
- angular-oauth2-oidc puts `<nonce>;<encodeURIComponent(returnPath)>` into the
  `state` parameter. The nonce and the PKCE verifier are stored in
  `localStorage` of the origin (heimvio's app also uses `localStorage` as
  `OAuthStorage`), so heimvio's app can validate and finish the flow.
- After `loadDiscoveryDocumentAndTryLogin()` heimvio's app reads
  `OAuthService.state`. It holds the return path **URI-encoded once**:
  `returnPath = decodeURIComponent(oauth.state)`.
- heimvio's app accepts the return path only if all of the following hold,
  otherwise it ignores it and continues as usual:
  - it matches `^/apps/[a-z0-9][a-z0-9-]{1,30}/[A-Za-z0-9\-._~!$&'()*+,;=:@%/?#]*$`
    (same origin, no scheme, below `/apps/<slug>/`),
  - its path part (before `?`/`#`) contains no `//`,
  - its path part, percent-decoded, has no `.` or `..` segment and no `\`.
- On success heimvio's app performs a **full navigation**
  (`window.location.replace(returnPath)`), not a router navigation —
  `/apps/` is not part of heimvio's app.

`returnPathFromOAuthState()` and `isExtensionReturnPath()` in
`@heimvio/ext-sdk-angular` are the reference implementation of these rules
(unit-tested); heimvio's app may copy them.

## 5. Talking to heimvio

Every call carries

- `Authorization: Bearer <access token of the user>` and
- `X-Trace-Id: <id>` matching `^[A-Za-z0-9][A-Za-z0-9._-]{5,63}$` (the SDKs
  generate ids in heimvio's format `<12 characters>.<n>`). With the id,
  heimvio's operator finds the request in heimvio's logs when you report a
  problem. Ids that do not match are dropped by heimvio, never forwarded.

### 5.1 Who is the user — `whoami`

```http
GET /api/rpc/whoami
```

```json
{ "user_id": "…", "org_id": "…", "roles": ["property_manager"], "display_name": "…", … }
```

`org_id` is the user's **current** organisation in heimvio (the one chosen in
heimvio's footer). Everything the extension reads and writes refers to it.
Roles are `property_manager`, `beirat` (advisory board), `owner`,
`meter_reader`, `tenant`, `iam_org_owner`; a user can have several.

### 5.2 Is the extension switched on — `/heimvio/ext/me`

```http
GET /heimvio/ext/me?slug=<slug>
```

```json
{
  "slug": "hello",
  "installed": true,
  "expires_at": "2026-10-20T14:32:00Z",
  "org_id": "…", "org_name": "WEG Musterstraße",
  "user_id": "…", "display_name": "Erika Muster",
  "roles": ["property_manager"]
}
```

Any signed-in user may ask. `installed` is computed by heimvio with heimvio's
clock (an expired installation is not installed); `expires_at` is `null` when
not installed. An unknown slug answers `installed: false`. The same data is
available as the RPC `POST /api/rpc/extension_me` with `{"p_slug": "<slug>"}`.

Both SDKs use this as the **gate**: the Angular shell shows "nicht
freigeschaltet", the Node SDK answers `403 {"error":"not_installed"}`.

### 5.3 PostgREST in five patterns

heimvio's tables are exposed as views in the API schema; what a user sees is
filtered by row level security. Names of views and functions are heimvio's
internal API and may change; use only what your extension needs, and ask the
heimvio team before relying on something new.

| Pattern | Request |
|---|---|
| Read with columns and filter | `GET /api/property?select=id,name&name=ilike.*haus*&order=name` |
| One row | `GET /api/property?id=eq.<uuid>` with `Accept: application/vnd.pgrst.object+json` |
| Insert, return the row | `POST /api/<view>` with JSON body and `Prefer: return=representation` |
| Update | `PATCH /api/<view>?id=eq.<uuid>` with JSON body |
| Call a function | `POST /api/rpc/<name>` with the arguments as JSON object (`{"p_x": …}`) |

Errors come as JSON `{code, message, details, hint}`. **Branch on `hint`**
(machine-readable reason, e.g. `invalid_minutes`) and on `code` (SQLSTATE),
never on `message` — the message text may change.

Status codes worth knowing:

| Status | Meaning |
|---|---|
| `401` with `code: "42501"` | Permission denied — a row level security refusal, a missing role, or an organisation whose subscription is read-only (the `message` says which, for humans). heimvio's PostgREST maps SQLSTATE 42501 to 401. Not an expired token — do not refresh. |
| `401` otherwise | Token missing or expired; refresh and retry once. |
| `400` with `code: "22023"` | Invalid argument; see `hint`. |
| `404` | Unknown view or function (or a function the user may not call). |

### 5.4 heimvio sidecar

Routes below `/heimvio/` are heimvio's service layer. An extension needs only
`/heimvio/ext/me` (above). Other routes are internal; ask before using one.

## 6. Angular SDK

```bash
npm install @heimvio/ext-sdk-angular @heimvio/zitadel-pgrst-angular angular-oauth2-oidc
```

```ts
// main.ts
import { bootstrapApplication } from '@angular/platform-browser';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideHeimvioExtension } from '@heimvio/ext-sdk-angular';
import { App } from './app';

bootstrapApplication(App, {
  providers: [provideZonelessChangeDetection(), ...provideHeimvioExtension({ slug: 'hello' })]
});
```

```ts
// app.ts
import { ChangeDetectionStrategy, Component, inject, resource } from '@angular/core';
import { HeimvioApi, HeimvioExtension, HeimvioExtensionShellComponent } from '@heimvio/ext-sdk-angular';

@Component({
  selector: 'app-root',
  imports: [HeimvioExtensionShellComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <hv-ext-shell title="Hello">
      <h1>Hello {{ ext.me()?.display_name }} ({{ ext.me()?.org_name }})</h1>
      <p>Roles: {{ ext.me()?.roles?.join(', ') }}</p>
    </hv-ext-shell>
  `
})
export class App {
  protected readonly ext = inject(HeimvioExtension);
  private readonly api = inject(HeimvioApi);
  readonly properties = resource({ loader: () => this.api.get<{ id: string; name: string }[]>('property', { select: 'id,name' }) });
}
```

What `provideHeimvioExtension({ slug })` sets up:

- the auth building block of `@heimvio/zitadel-pgrst-angular` with
  `configUrl: '/config.json'`, PostgREST pinned to `/api`, `X-Trace-Id` on the
  building block's own calls,
- `localStorage` as token storage (shared with heimvio's app),
- an app initializer that refreshes or starts the sign-in (§4) and asks the
  gate (§5.2).

| API | Purpose |
|---|---|
| `HeimvioExtension` | `state()` (`loading`, `login`, `ready`, `not-installed`, `error`), `me()`, `remainingMs()`, `check()`. Re-checks every minute and right after the displayed expiry. |
| `HeimvioApi` | `rpc(name, args)`, `get(path, query)`, `post(path, body, {prefer})` against `/api`; `sidecar(path, init)` against `/heimvio`; `backend(path, init)` against the extension's own backend (relative to `<base href>`). All with the user's token and a trace id; a `401` triggers one refresh and one retry (not for `42501`). Errors are `HeimvioApiError` with `status`, `code`, `hint`. |
| `<hv-ext-shell title="…">` | Header with organisation, user, remaining time and "zurück zu heimvio"; projects its content only while the extension is installed, otherwise shows "Nicht freigeschaltet". Texts are German by default; override with `provideHeimvioExtension({ slug, labels: { … } })`. Colours via CSS custom properties `--hv-ext-fg`, `--hv-ext-bg`, `--hv-ext-header-bg`, `--hv-ext-border`, `--hv-ext-font`. |

## 7. Node SDK

```bash
npm install @heimvio/ext-sdk-node
```

```ts
import { createExtensionApp, serveExtension } from '@heimvio/ext-sdk-node';

const app = createExtensionApp(); // slug from HEIMVIO_EXT_SLUG, API from HEIMVIO_API_BASE

app.get('/api/hello', async c => {
  const who = await c.get('heimvio').rpc('whoami'); // as the signed-in user
  return c.json({ who, org: c.get('extension').org_name });
});

serveExtension(app, { staticRoot: 'public' }); // port 8080, frontend with <base href> = HEIMVIO_EXT_BASE
```

| API | Purpose |
|---|---|
| `createExtensionApp(opts?)` | Hono app with `GET /healthz` and, on `protectedPaths` (default `/api/*`): token verification against `<apiBase>/jwks.json` (jose; keys cached, refetched on an unknown key id), then the gate (`/heimvio/ext/me`, cached per token for 10 s). Handlers get `c.get('user')` (`{jwt, sub, claims}`), `c.get('extension')`, `c.get('heimvio')`, `c.get('traceId')`. Answers `401 {"error":"unauthorized"}`, `403 {"error":"not_installed"}`, `502 {"error":"gate_unavailable"}`. Options: `slug`, `apiBase`, `protectedPaths`, `gate`, `gateCacheMs`, `issuer`, `audience`. |
| `asUser(jwt, {apiBase, traceId})` | `rpc`, `get`, `post` against `<apiBase>/api`, `sidecar(path, init)` against `<apiBase>/heimvio`, `extensionMe(slug)`; forwards the user's token and the trace id. |
| `requireUser`, `requireInstalled`, `createTokenVerifier` | The building blocks of `createExtensionApp`, for your own composition. |
| `serveExtension(app, {staticRoot})`, `spaStatic`, `rewriteBaseHref` | Serve the built frontend with `index.html` fallback and the right `<base href>`; listen on `PORT` (8080). |
| `readExtensionEnv()` | Reads and validates the container contract (§3). |

The incoming `X-Trace-Id` of the frontend is reused for the calls to heimvio
when it is valid, so one user action is one id across browser, extension and
heimvio.

## 8. Development setup

The packages are published to the **GitHub Packages npm registry**, which
requires a token even for public packages:

```bash
# .npmrc in your project (no secret, commit it)
@heimvio:registry=https://npm.pkg.github.com
# ~/.npmrc (never commit): token with read:packages
//npm.pkg.github.com/:_authToken=<token>     # e.g. from `gh auth token`
```

In a Docker build pass the token as a BuildKit secret
(`docker build --secret id=npm_token,env=GITHUBPACKAGESTOKEN`; inside the `RUN`, write `//npm.pkg.github.com/:_authToken=$NPM_TOKEN` to `~/.npmrc` and delete it in the same step — see `examples/hello/Dockerfile`), never as
`ARG` or `ENV`.

Running locally: start the extension's backend with
`HEIMVIO_EXT_SLUG=<slug> HEIMVIO_API_BASE=<a heimvio dev stack>`; the frontend
needs to be served on heimvio's origin under `/apps/<slug>/` to share the
session — in practice you test against a heimvio development stack that
routes `/apps/<slug>/` to your container.

## 9. Limits

- No background work and no identity of its own (see §1).
- No internationalisation in the SDK; the shell texts are German defaults.
- Extensions run under `/apps/<slug>/`, not under heimvio's language prefix.
- Only what this document describes is a contract. heimvio's views and
  functions may change; an extension that uses more than `whoami`,
  `/heimvio/ext/me` and the PostgREST patterns above should be built together
  with the heimvio team.
