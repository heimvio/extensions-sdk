import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  HeimvioApi,
  HeimvioExtension,
  HeimvioExtensionShellComponent,
  formatRemainingDe
} from '@heimvio/ext-sdk-angular';
import { backendErrorText, helloLine, roleLabels } from './hello';

@Component({
  selector: 'app-root',
  imports: [HeimvioExtensionShellComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <hv-ext-shell title="Hello">
      <h1 class="hello" data-testid="hello-title">{{ title() }}</h1>
      <dl class="facts">
        <dt>Rollen</dt>
        <dd data-testid="hello-roles">{{ roles() }}</dd>
        <dt>Restlaufzeit</dt>
        <dd data-testid="hello-remaining">{{ remaining() }}</dd>
      </dl>
      <button type="button" data-testid="hello-call" [disabled]="busy()" (click)="callBackend()">
        Backend fragen (whoami)
      </button>
      @if (error(); as e) {
        <p role="alert" class="error" data-testid="hello-error">{{ e }}</p>
      }
      @if (result(); as r) {
        <pre class="result" data-testid="hello-result">{{ r }}</pre>
      }
    </hv-ext-shell>
  `,
  styles: `
    .hello { font-size: clamp(1.75rem, 6vw, 3rem); line-height: 1.15; margin: 8px 0 24px; overflow-wrap: anywhere; }
    .facts { display: grid; grid-template-columns: max-content 1fr; gap: 4px 16px; margin: 0 0 24px; }
    .facts dt { font-weight: 600; }
    .facts dd { margin: 0; }
    button { min-height: 44px; padding: 0 16px; font: inherit; }
    .error { color: #b3261e; }
    .result { margin-top: 16px; padding: 12px; overflow-x: auto; border: 1px solid var(--hv-ext-border, #d9d9de); border-radius: 6px; }
  `
})
export class App {
  private readonly ext = inject(HeimvioExtension);
  private readonly api = inject(HeimvioApi);

  protected readonly title = computed(() => helloLine(this.ext.me()));
  protected readonly roles = computed(() => roleLabels(this.ext.me()?.roles));
  protected readonly remaining = computed(() => formatRemainingDe(this.ext.remainingMs()));

  protected readonly busy = signal(false);
  protected readonly result = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  /** Calls the extension's own backend (`GET api/whoami`, relative to <base href>) with the user's token. */
  protected async callBackend(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      const res = await this.api.backend('api/whoami');
      const text = await res.text();
      let body: unknown = text;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        /* plain text */
      }
      if (res.ok) {
        this.result.set(JSON.stringify(body, null, 2));
      } else {
        this.result.set(null);
        this.error.set(backendErrorText(res.status, body));
      }
    } catch {
      this.result.set(null);
      this.error.set('Das Backend der Erweiterung ist nicht erreichbar.');
    } finally {
      this.busy.set(false);
    }
  }
}

