import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { OAuthService } from 'angular-oauth2-oidc';
import { AuthService } from '@heimvio/zitadel-pgrst-angular/auth';
import { HeimvioApi } from './api';
import { HEIMVIO_EXTENSION_CONFIG } from './config';
import { ExtensionMe, extensionReturnPath, remainingMs } from './logic';

/** Where the extension stands: session, installation gate, errors. */
export type ExtensionState = 'loading' | 'login' | 'ready' | 'not-installed' | 'error';

/**
 * Session and installation gate of an extension.
 *
 * `start()` runs as app initializer (registered by `provideHeimvioExtension`):
 * it waits for the auth building block, refreshes an expired token if a
 * refresh token is there, otherwise starts the login through heimvio's
 * `/callback` with the current path as OAuth `state`. With a session it asks
 * `GET /heimvio/ext/me?slug=` whether the user's current organisation has
 * the extension installed.
 *
 * The gate is a product gate, not a security boundary: heimvio's API does not
 * tell an extension's calls from the user's own — row level security decides.
 */
@Injectable({ providedIn: 'root' })
export class HeimvioExtension {
  private readonly auth = inject(AuthService);
  private readonly oauth = inject(OAuthService);
  private readonly api = inject(HeimvioApi);
  private readonly cfg = inject(HEIMVIO_EXTENSION_CONFIG);

  readonly state = signal<ExtensionState>('loading');
  readonly me = signal<ExtensionMe | null>(null);
  readonly error = signal<string | null>(null);
  /** Ticks every 15 s, drives the remaining time. */
  readonly now = signal(Date.now());
  readonly remainingMs = computed(() => remainingMs(this.me()?.expires_at, this.now()));
  readonly installed = computed(() => this.state() === 'ready');

  private timer: ReturnType<typeof setInterval> | null = null;
  private lastCheck = 0;
  private expiryChecked = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stopTimer());
  }

  get slug(): string {
    return this.cfg.slug;
  }

  /** Session first, then the gate. Never throws; the result is in `state`. */
  async start(): Promise<void> {
    await this.auth.initialized;
    if (!this.auth.isAuthenticated() && this.oauth.getRefreshToken()) {
      try {
        await this.auth.refresh();
        await this.auth.loadProfile();
      } catch {
        /* refresh token expired as well -> login */
      }
    }
    if (!this.auth.isAuthenticated()) {
      this.state.set('login');
      this.auth.login(extensionReturnPath(this.cfg.slug, window.location));
      return;
    }
    await this.check();
    this.startTimer();
  }

  /** Asks heimvio again (`/heimvio/ext/me`). */
  async check(): Promise<void> {
    this.lastCheck = Date.now();
    try {
      const res = await this.api.sidecar(`ext/me?slug=${encodeURIComponent(this.cfg.slug)}`);
      if (!res.ok) throw new Error(`ext/me ${res.status}`);
      const me = (await res.json()) as ExtensionMe;
      this.me.set(me);
      this.error.set(null);
      // `installed` is computed by heimvio with its own clock; the remaining
      // time in the header is display only.
      this.state.set(me.installed ? 'ready' : 'not-installed');
      this.expiryChecked = remainingMs(me.expires_at, Date.now()) === 0;
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : String(e));
      this.state.set('error');
    }
  }

  private startTimer(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      const now = Date.now();
      this.now.set(now);
      // Ask once right after the displayed expiry, otherwise every recheckMs.
      const expired = this.state() === 'ready' && this.remainingMs() === 0 && !this.expiryChecked;
      if (expired) this.expiryChecked = true;
      if (expired || now - this.lastCheck >= this.cfg.recheckMs) void this.check();
    }, 15_000);
  }

  private stopTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
