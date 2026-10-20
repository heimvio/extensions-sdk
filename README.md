# heimvio extensions SDK

Build **extensions** for [heimvio](https://heimvio.de): web apps that run on
heimvio's origin under `heimvio.de/apps/<slug>/`, signed in with the same user,
and talk to heimvio through its public REST API with that user's rights.

| Package | What it does |
|---|---|
| [`@heimvio/ext-sdk-angular`](packages/ext-sdk-angular) | `provideHeimvioExtension({ slug })` — heimvio's session, a client for PostgREST and the sidecar with the user's token, `<hv-ext-shell>` with organisation, user, remaining time and the installation gate. |
| [`@heimvio/ext-sdk-node`](packages/ext-sdk-node) | `createExtensionApp()` — a [Hono](https://hono.dev) backend that verifies the user's token, applies the installation gate and calls heimvio as the user (`asUser(jwt)`); `serveExtension()` serves the frontend on port 8080. |
| `examples/hello` | A complete extension: "Hello <user> (<organisation>)", built as one image (`ghcr.io/heimvio/ext-hello`). |

**Start with [docs/EXTENSIONS.md](docs/EXTENSIONS.md)** — the contract
(container, environment, sign-in, APIs) and an honest description of the
security model: an extension has the full rights of the signed-in user, so
only extensions registered by heimvio's operator run on heimvio.

## Installing the packages

The packages are published to the GitHub Packages npm registry. It needs a
token with `read:packages`, even for public packages:

```bash
# .npmrc of your project
@heimvio:registry=https://npm.pkg.github.com
# ~/.npmrc (never commit)
//npm.pkg.github.com/:_authToken=<token>
```

```bash
npm install @heimvio/ext-sdk-angular @heimvio/zitadel-pgrst-angular angular-oauth2-oidc   # frontend
npm install @heimvio/ext-sdk-node                                                         # backend
```

## Working on this repository

```bash
npm install      # needs a built ../zitadel-pgrst-angular checkout, see CONTRIBUTING.md
npm run build    # both packages (ng-packagr, tsc)
npm test         # vitest, no network
```

See [CONTRIBUTING.md](CONTRIBUTING.md). License: [MIT](LICENSE).
