import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { HEIMVIO_EXTENSION_CONFIG } from './config';
import { HeimvioExtension } from './extension.service';

/**
 * Frame of an extension page: header with organisation, user, remaining time
 * and a link back to heimvio; the page itself is projected (`ng-content`)
 * only while the extension is installed for the user's organisation.
 *
 * ```html
 * <hv-ext-shell title="Hello">
 *   <my-page />
 * </hv-ext-shell>
 * ```
 */
@Component({
  selector: 'hv-ext-shell',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="hv-ext-header">
      <a class="hv-ext-back" [href]="cfg.homeUrl">&larr; {{ labels.back }}</a>
      @if (title()) {
        <span class="hv-ext-title">{{ title() }}</span>
      }
      <span class="hv-ext-spacer"></span>
      @if (me(); as m) {
        <span class="hv-ext-org" data-testid="hv-ext-org">{{ m.org_name }}</span>
        <span class="hv-ext-user" data-testid="hv-ext-user">{{ m.display_name }}</span>
        @if (ext.state() === 'ready') {
          <span class="hv-ext-remaining" data-testid="hv-ext-remaining">{{ remaining() }}</span>
        }
      }
    </header>
    <main class="hv-ext-main">
      @switch (ext.state()) {
        @case ('ready') {
          <ng-content />
        }
        @case ('not-installed') {
          <section class="hv-ext-notice" data-testid="hv-ext-not-installed">
            <h1>{{ labels.notInstalledTitle }}</h1>
            <p>{{ labels.notInstalled(me()?.org_name ?? null) }}</p>
            <p><a [href]="cfg.settingsUrl">{{ labels.openSettings }}</a></p>
          </section>
        }
        @case ('error') {
          <section class="hv-ext-notice" data-testid="hv-ext-error">
            <p>{{ labels.error }}</p>
            <button type="button" (click)="retry()">{{ labels.retry }}</button>
          </section>
        }
        @case ('login') {
          <p class="hv-ext-notice">{{ labels.login }}</p>
        }
        @default {
          <p class="hv-ext-notice">{{ labels.loading }}</p>
        }
      }
    </main>
  `,
  styles: `
    :host { display: block; min-height: 100vh; font-family: var(--hv-ext-font, system-ui, sans-serif); color: var(--hv-ext-fg, #1d1d1f); background: var(--hv-ext-bg, #fff); }
    .hv-ext-header { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; padding: 8px 16px; border-bottom: 1px solid var(--hv-ext-border, #d9d9de); background: var(--hv-ext-header-bg, #f6f6f8); }
    .hv-ext-back { color: inherit; min-height: 44px; display: inline-flex; align-items: center; }
    .hv-ext-title { font-weight: 600; }
    .hv-ext-spacer { flex: 1; }
    .hv-ext-remaining { font-variant-numeric: tabular-nums; }
    .hv-ext-main { padding: 16px; }
    .hv-ext-notice { max-width: 40rem; }
    button { min-height: 44px; padding: 0 16px; }
    @media (prefers-color-scheme: dark) {
      :host { color: var(--hv-ext-fg, #f2f2f5); background: var(--hv-ext-bg, #151517); }
      .hv-ext-header { background: var(--hv-ext-header-bg, #1f1f23); border-color: var(--hv-ext-border, #333338); }
    }
  `
})
export class HeimvioExtensionShellComponent {
  protected readonly ext = inject(HeimvioExtension);
  protected readonly cfg = inject(HEIMVIO_EXTENSION_CONFIG);
  protected readonly labels = this.cfg.labels;
  protected readonly me = this.ext.me;
  protected readonly remaining = computed(() => this.labels.remaining(this.ext.remainingMs()));

  /** Optional page title next to the back link. */
  readonly title = input<string>('');

  protected retry(): void {
    void this.ext.check();
  }
}
