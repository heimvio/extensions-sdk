/**
 * Pure helpers of the Angular SDK — no Angular imports, unit-tested with
 * vitest. The same rules are documented in docs/EXTENSIONS.md; the return
 * path rules are the contract with the heimvio SPA's `/callback`.
 */

/** Answer of `GET /heimvio/ext/me?slug=<slug>` (= `api.extension_me`). */
export interface ExtensionMe {
  slug: string;
  installed: boolean;
  /** ISO timestamp; null when not installed. */
  expires_at: string | null;
  org_id: string | null;
  org_name: string | null;
  user_id: string | null;
  display_name: string | null;
  roles: string[];
}

/** Slug rule shared with the database and the proxy: `^[a-z0-9][a-z0-9-]{1,30}$`. */
export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,30}$/;

export function isValidSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug);
}

/** Base path of an extension: `/apps/<slug>/`. */
export function extensionBasePath(slug: string): string {
  if (!isValidSlug(slug)) throw new Error(`invalid extension slug: ${slug}`);
  return `/apps/${slug}/`;
}

/**
 * Accepts a path the heimvio SPA may navigate back to after the OIDC
 * callback: below `/apps/<slug>/`, same origin, no traversal, no scheme.
 * The heimvio SPA applies exactly this rule to the decoded `state`.
 */
export const RETURN_PATH_PATTERN = /^\/apps\/[a-z0-9][a-z0-9-]{1,30}\/[A-Za-z0-9\-._~!$&'()*+,;=:@%/?#]*$/;

export function isExtensionReturnPath(path: string): boolean {
  if (!RETURN_PATH_PATTERN.test(path)) return false;
  const pathname = path.split(/[?#]/, 1)[0] ?? '';
  if (pathname.includes('//')) return false;
  // Traversal in clear text and percent-encoded (%2e = '.', %2f = '/', %5c = '\').
  const decoded = safeDecode(pathname);
  if (decoded === null) return false;
  if (/(^|\/)\.\.?(\/|$)/.test(decoded) || decoded.includes('\\') || decoded.includes('//')) return false;
  return true;
}

function safeDecode(s: string): string | null {
  try {
    return decodeURIComponent(s);
  } catch {
    return null;
  }
}

/**
 * The OAuth `state` an extension sends when it has to start the login: the
 * current location if it lies below the extension's base path, otherwise the
 * base path itself.
 */
export function extensionReturnPath(slug: string, loc: { pathname: string; search?: string; hash?: string }): string {
  const base = extensionBasePath(slug);
  const pathname = loc.pathname === base.slice(0, -1) ? base : loc.pathname;
  const candidate = pathname + (loc.search ?? '') + (loc.hash ?? '');
  return pathname.startsWith(base) && isExtensionReturnPath(candidate) ? candidate : base;
}

/**
 * For the heimvio SPA (reference implementation of the contract): turns
 * `OAuthService.state` after the callback into the path to navigate to, or
 * null if the state is no extension return path. angular-oauth2-oidc hands
 * the additional state over URI-encoded once, hence one decode.
 */
export function returnPathFromOAuthState(state: string | null | undefined): string | null {
  if (!state) return null;
  const decoded = safeDecode(state);
  if (decoded === null) return null;
  return isExtensionReturnPath(decoded) ? decoded : null;
}

/** Remaining milliseconds until `expiresAt`; 0 when expired or unknown. */
export function remainingMs(expiresAt: string | null | undefined, now: number): number {
  if (!expiresAt) return 0;
  const t = Date.parse(expiresAt);
  if (Number.isNaN(t)) return 0;
  return Math.max(0, t - now);
}

/** German default for the remaining time in the shell header. */
export function formatRemainingDe(ms: number): string {
  if (ms <= 0) return 'abgelaufen';
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return 'noch unter 1 Minute';
  if (minutes < 60) return `noch ${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `noch ${h} h` : `noch ${h} h ${m} min`;
}

/** heimvio's trace id rule (`X-Trace-Id`): `^[A-Za-z0-9][A-Za-z0-9._-]{5,63}$`. */
export const TRACE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{5,63}$/;

const ALNUM = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** 12 random characters naming one page load; requests append `.<n>`. */
export function newInteractionId(random: () => number = Math.random): string {
  let s = '';
  for (let i = 0; i < 12; i++) s += ALNUM[Math.floor(random() * ALNUM.length)];
  return s;
}

/** Sequential trace ids `<interaction>.<n>` — the format heimvio's SPA uses. */
export function traceIdSequence(interaction: string): () => string {
  let n = 0;
  return () => `${interaction}.${++n}`;
}

/** Joins a path below `/api` (PostgREST) or `/heimvio` (sidecar) without double slashes. */
export function joinPath(base: string, path: string): string {
  return base.replace(/\/+$/, '') + '/' + path.replace(/^\/+/, '');
}

/** Builds a query string from a plain object; arrays repeat the key. */
export function toQuery(query?: Record<string, string | number | boolean | Array<string | number | boolean> | null | undefined>): string {
  if (!query) return '';
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === null || v === undefined) continue;
    if (Array.isArray(v)) v.forEach(x => p.append(k, String(x)));
    else p.append(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}
