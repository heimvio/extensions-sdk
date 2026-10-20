import { describe, expect, it } from 'vitest';
import {
  extensionBasePath,
  extensionReturnPath,
  formatRemainingDe,
  isExtensionReturnPath,
  isValidSlug,
  joinPath,
  newInteractionId,
  remainingMs,
  returnPathFromOAuthState,
  toQuery,
  TRACE_ID_PATTERN,
  traceIdSequence
} from './logic';

describe('slug', () => {
  it('accepts the database rule', () => {
    expect(isValidSlug('hello')).toBe(true);
    expect(isValidSlug('ab')).toBe(true);
    expect(isValidSlug('a')).toBe(false);
    expect(isValidSlug('-hello')).toBe(false);
    expect(isValidSlug('Hello')).toBe(false);
    expect(isValidSlug('a'.repeat(32))).toBe(false);
  });
  it('builds the base path', () => {
    expect(extensionBasePath('hello')).toBe('/apps/hello/');
    expect(() => extensionBasePath('../x')).toThrow();
  });
});

describe('return path (contract with heimvio /callback)', () => {
  it('accepts paths below /apps/<slug>/', () => {
    expect(isExtensionReturnPath('/apps/hello/')).toBe(true);
    expect(isExtensionReturnPath('/apps/hello/a/b?x=1#top')).toBe(true);
  });
  it('rejects everything else', () => {
    for (const p of [
      '/apps/hello',
      '/settings/org',
      'https://evil.example/apps/hello/',
      '//evil.example/apps/hello/',
      '/apps/hello//evil.example',
      '/apps/hello/../../settings',
      '/apps/hello/%2e%2e/settings',
      '/apps/hello/%2E%2E/x',
      '/apps/hello/a%5cb',
      '/apps/hello/a\\b',
      '/apps/hello/ x',
      '/apps/hello/%zz',
      '/apps/Hello/'
    ]) {
      expect(isExtensionReturnPath(p), p).toBe(false);
    }
  });
  it('derives the state from the current location', () => {
    expect(extensionReturnPath('hello', { pathname: '/apps/hello/x', search: '?a=1', hash: '#h' })).toBe('/apps/hello/x?a=1#h');
    expect(extensionReturnPath('hello', { pathname: '/apps/hello' })).toBe('/apps/hello/');
    expect(extensionReturnPath('hello', { pathname: '/apps/other/x' })).toBe('/apps/hello/');
    expect(extensionReturnPath('hello', { pathname: '/apps/hello/../x' })).toBe('/apps/hello/');
  });
  it('reads OAuthService.state as angular-oauth2-oidc hands it over (encoded once)', () => {
    const path = '/apps/hello/x?a=1&b=2';
    expect(returnPathFromOAuthState(encodeURIComponent(path))).toBe(path);
    expect(returnPathFromOAuthState(encodeURIComponent('/settings'))).toBeNull();
    expect(returnPathFromOAuthState(encodeURIComponent('https://evil.example/apps/hello/'))).toBeNull();
    expect(returnPathFromOAuthState('')).toBeNull();
    expect(returnPathFromOAuthState(null)).toBeNull();
    expect(returnPathFromOAuthState('%E0%A4%A')).toBeNull();
  });
});

describe('remaining time', () => {
  const now = Date.parse('2026-10-20T10:00:00Z');
  it('computes milliseconds', () => {
    expect(remainingMs('2026-10-20T10:30:00Z', now)).toBe(30 * 60_000);
    expect(remainingMs('2026-10-20T09:00:00Z', now)).toBe(0);
    expect(remainingMs(null, now)).toBe(0);
    expect(remainingMs('nonsense', now)).toBe(0);
  });
  it('formats in German', () => {
    expect(formatRemainingDe(0)).toBe('abgelaufen');
    expect(formatRemainingDe(30_000)).toBe('noch unter 1 Minute');
    expect(formatRemainingDe(42 * 60_000 + 5_000)).toBe('noch 42 min');
    expect(formatRemainingDe(120 * 60_000)).toBe('noch 2 h');
    expect(formatRemainingDe(135 * 60_000)).toBe('noch 2 h 15 min');
  });
});

describe('trace ids', () => {
  it('match heimvio\'s rule', () => {
    const next = traceIdSequence(newInteractionId());
    const a = next();
    const b = next();
    expect(a).toMatch(TRACE_ID_PATTERN);
    expect(b.endsWith('.2')).toBe(true);
  });
});

describe('url helpers', () => {
  it('joins without double slashes', () => {
    expect(joinPath('/api/', '/rpc/whoami')).toBe('/api/rpc/whoami');
    expect(joinPath('/heimvio', 'ext/me')).toBe('/heimvio/ext/me');
  });
  it('builds query strings', () => {
    expect(toQuery({ select: 'id,name', id: 'eq.1', skip: undefined, n: null })).toBe('?select=id%2Cname&id=eq.1');
    expect(toQuery({ a: ['1', '2'] })).toBe('?a=1&a=2');
    expect(toQuery()).toBe('');
  });
});
