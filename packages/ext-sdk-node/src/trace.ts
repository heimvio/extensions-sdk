import { randomBytes } from 'node:crypto';

/** heimvio's acceptance rule for `X-Trace-Id`; anything else is replaced, never forwarded. */
export const TRACE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{5,63}$/;

export function isTraceId(value: string | null | undefined): value is string {
  return typeof value === 'string' && TRACE_ID_PATTERN.test(value);
}

/** A fresh id in heimvio's format (`<12 chars>.1`). */
export function newTraceId(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = randomBytes(12);
  let s = '';
  for (const b of bytes) s += alphabet[b % alphabet.length];
  return `${s}.1`;
}

/** The incoming id if it is valid, otherwise a new one. */
export function traceIdFrom(header: string | null | undefined): string {
  return isTraceId(header) ? header : newTraceId();
}
