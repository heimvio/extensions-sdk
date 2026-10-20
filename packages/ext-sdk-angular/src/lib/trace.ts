import { newInteractionId, traceIdSequence } from './logic';

/**
 * One interaction id per page load, one sequence number per request
 * (`<interaction>.<n>`) — the format of heimvio's own SPA, so a request of an
 * extension shows up in heimvio's trace timeline like any other.
 */
export class HeimvioTrace {
  readonly interaction = newInteractionId();
  readonly next = traceIdSequence(this.interaction);
}

/** Shared instance: the auth building block's `extraHeaders` runs outside DI. */
export const heimvioTrace = new HeimvioTrace();
