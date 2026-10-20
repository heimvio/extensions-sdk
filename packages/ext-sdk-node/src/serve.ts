import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { serve } from '@hono/node-server';
import type { Hono, MiddlewareHandler } from 'hono';
import type { Env } from 'hono';
import { readExtensionEnv } from './env.js';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json'
};

/** Sets `<base href>` of an index.html to the extension's public base path. */
export function rewriteBaseHref(html: string, base: string): string {
  const tag = `<base href="${base.replace(/"/g, '&quot;')}">`;
  if (/<base\s[^>]*>/i.test(html)) return html.replace(/<base\s[^>]*>/i, tag);
  return html.replace(/<head(\s[^>]*)?>/i, m => `${m}\n  ${tag}`);
}

export interface SpaStaticOptions {
  /** Directory of the built Angular app (contains index.html). */
  root: string;
  /** Public base path (`HEIMVIO_EXT_BASE`, `/apps/<slug>/`) written into `<base href>`. */
  base: string;
  /** Path prefixes never answered with files or index.html; default `['/api/']`. */
  exclude?: string[];
}

/**
 * Serves the built frontend: files from `root`, everything else (GET/HEAD)
 * as `index.html` with `<base href>` set to the public base path. The proxy
 * strips `/apps/<slug>` before the request reaches the container.
 */
export function spaStatic<E extends Env>(o: SpaStaticOptions): MiddlewareHandler<E> {
  const root = resolve(o.root);
  const exclude = o.exclude ?? ['/api/'];
  let index: string | null = null;
  return async (c, next) => {
    if (c.req.method !== 'GET' && c.req.method !== 'HEAD') return next();
    let path: string;
    try {
      path = decodeURIComponent(new URL(c.req.url).pathname);
    } catch {
      return c.text('bad request', 400);
    }
    if (exclude.some(p => path.startsWith(p))) return next();
    const file = resolve(join(root, path));
    if ((file === root || file.startsWith(root + sep)) && path !== '/' && !path.endsWith('/')) {
      try {
        const s = await stat(file);
        if (s.isFile()) {
          const body = await readFile(file);
          return c.body(body, 200, {
            'Content-Type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
            'Cache-Control': /[-.][0-9a-z]{8,}\.(js|css)$/i.test(file) ? 'public, max-age=31536000, immutable' : 'no-cache'
          });
        }
      } catch {
        /* not a file -> index.html */
      }
    }
    if (extname(path) && extname(path) !== '.html') return next();
    index ??= rewriteBaseHref(await readFile(join(root, 'index.html'), 'utf8'), o.base);
    return c.html(index, 200, { 'Cache-Control': 'no-cache' });
  };
}

export interface ServeExtensionOptions {
  /** Built frontend; without it only the API is served. */
  staticRoot?: string;
  port?: number;
  base?: string;
  hostname?: string;
}

/**
 * Starts the extension on `PORT` (8080): the app's own routes first, then the
 * frontend from `staticRoot`. Values default to the container contract
 * (`HEIMVIO_EXT_SLUG`, `HEIMVIO_EXT_BASE`, `PORT`).
 */
export function serveExtension<E extends Env>(app: Hono<E>, opts: ServeExtensionOptions = {}): ReturnType<typeof serve> {
  const env = readExtensionEnv();
  const base = opts.base ?? env.base;
  if (opts.staticRoot) app.use('*', spaStatic<E>({ root: opts.staticRoot, base }));
  return serve({ fetch: app.fetch, port: opts.port ?? env.port, hostname: opts.hostname ?? '0.0.0.0' });
}
