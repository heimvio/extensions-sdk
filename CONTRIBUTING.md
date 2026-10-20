# Contributing

Thank you for helping. Issues and pull requests are welcome on
<https://github.com/heimvio/extensions-sdk>.

## Setup

- Node.js 20 or newer, npm 10 or newer.
- A GitHub token with `read:packages` in `~/.npmrc`
  (`//npm.pkg.github.com/:_authToken=…`), because `@heimvio/*` packages come
  from GitHub Packages.
- Until `@heimvio/zitadel-pgrst-angular` 0.2 is published, the workspace links
  a local build of it: clone
  [heimvio/zitadel-pgrst-angular](https://github.com/heimvio/zitadel-pgrst-angular)
  next to this repository and run `npm install && npm run build:lib` there
  first (the root `package.json` points to
  `../zitadel-pgrst-angular/dist/zitadel-pgrst-angular`).

```bash
npm install
npm run build
npm test
```

## Rules

- Tests must not use the network: the Node SDK tests run against an
  in-process stand-in for heimvio (`packages/ext-sdk-node/test/mock-heimvio.ts`);
  Angular logic lives in pure functions (`src/lib/logic.ts`) tested with vitest.
- The SDKs implement the contract in [docs/EXTENSIONS.md](docs/EXTENSIONS.md).
  A change of the contract changes that document in the same pull request.
- Security first: never widen what an extension can do beyond the signed-in
  user's rights, never forward an unvalidated trace id, never accept a return
  path outside `/apps/<slug>/`.
- Strict TypeScript, no `any`. Code and comments in English.
- Versions follow semver; pre-releases are `x.y.z-dev.n`.
