# @heimvio/ext-sdk-angular

Angular building block for heimvio extensions (apps under `heimvio.de/apps/<slug>/`).

```ts
bootstrapApplication(App, { providers: [...provideHeimvioExtension({ slug: 'hello' })] });
```

- `provideHeimvioExtension({ slug })` — heimvio's session and configuration (`/config.json`), PostgREST at `/api`, trace ids, sign-in through heimvio's `/callback`, installation gate.
- `HeimvioApi` — `rpc`, `get`, `post` (PostgREST), `sidecar` (`/heimvio`), `backend` (your own backend), all with the user's token.
- `HeimvioExtension` — state, user, organisation, remaining time.
- `<hv-ext-shell>` — header and "not installed" page around your content.

Peer dependencies: Angular 21, `@heimvio/zitadel-pgrst-angular` ≥ 0.2, `angular-oauth2-oidc` 20.
Contract and security model: [docs/EXTENSIONS.md](https://github.com/heimvio/extensions-sdk/blob/main/docs/EXTENSIONS.md).
