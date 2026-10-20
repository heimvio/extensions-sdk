/** The runtime contract of an extension container (docs/EXTENSIONS.md). */
export interface ExtensionEnv {
  /** `HEIMVIO_EXT_SLUG` — the slug the extension is registered under. */
  slug: string;
  /** `HEIMVIO_EXT_BASE` — public base path, `/apps/<slug>/`; goes into `<base href>`. */
  base: string;
  /** `HEIMVIO_API_BASE` — heimvio's API as seen from the extensions network. */
  apiBase: string;
  /** `PORT` — always 8080 in production; overridable for local development. */
  port: number;
}

export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,30}$/;
export const DEFAULT_API_BASE = 'http://heimvio-api:8081';
export const DEFAULT_PORT = 8080;

export function readExtensionEnv(env: Record<string, string | undefined> = process.env): ExtensionEnv {
  const slug = env['HEIMVIO_EXT_SLUG'] ?? '';
  if (!SLUG_PATTERN.test(slug)) {
    throw new Error(`HEIMVIO_EXT_SLUG missing or invalid (${JSON.stringify(slug)}), expected ${SLUG_PATTERN}`);
  }
  const base = env['HEIMVIO_EXT_BASE'] || `/apps/${slug}/`;
  const port = Number(env['PORT'] || DEFAULT_PORT);
  return {
    slug,
    base: base.endsWith('/') ? base : `${base}/`,
    apiBase: (env['HEIMVIO_API_BASE'] || DEFAULT_API_BASE).replace(/\/+$/, ''),
    port: Number.isInteger(port) && port > 0 ? port : DEFAULT_PORT
  };
}
