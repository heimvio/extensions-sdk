import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readExtensionEnv, serveExtension } from '@heimvio/ext-sdk-node';
import { buildApp } from './app.js';

// Container contract (docs/EXTENSIONS.md §3): HEIMVIO_EXT_SLUG, HEIMVIO_EXT_BASE, HEIMVIO_API_BASE, PORT.
const env = readExtensionEnv();
if (env.slug !== 'hello') {
  console.warn(`HEIMVIO_EXT_SLUG is ${env.slug}, this image is built for "hello"`);
}

// The bundle lives in dist/server/, the Angular build in dist/web/ (in the image: /app/server, /app/web).
const here = dirname(fileURLToPath(import.meta.url));
const staticRoot = process.env['HELLO_STATIC_ROOT'] ?? join(here, '..', 'web');

const app = buildApp({ slug: env.slug, apiBase: env.apiBase });
serveExtension(app, { staticRoot, base: env.base, port: env.port });
console.log(`ext-${env.slug} listening on :${env.port}, base ${env.base}, heimvio at ${env.apiBase}`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => process.exit(0));
