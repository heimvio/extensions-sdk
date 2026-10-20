import { InjectionToken } from '@angular/core';
import { formatRemainingDe } from './logic';

/** Texts of `<hv-ext-shell>`. German defaults; override single entries via `provideHeimvioExtension({ labels })`. */
export interface ExtensionShellLabels {
  back: string;
  loading: string;
  login: string;
  notInstalledTitle: string;
  notInstalled: (orgName: string | null) => string;
  openSettings: string;
  error: string;
  retry: string;
  remaining: (ms: number) => string;
}

export const DEFAULT_SHELL_LABELS: ExtensionShellLabels = {
  back: 'zurück zu heimvio',
  loading: 'Wird geladen …',
  login: 'Anmeldung wird gestartet …',
  notInstalledTitle: 'Nicht freigeschaltet',
  notInstalled: org =>
    org
      ? `Diese Erweiterung ist für ${org} gerade nicht freigeschaltet. Ein Verwalter kann sie in heimvio unter Einstellungen → Organisation → Erweiterungen starten.`
      : 'Diese Erweiterung ist für Ihre Organisation gerade nicht freigeschaltet.',
  openSettings: 'Zu den Erweiterungen',
  error: 'heimvio ist gerade nicht erreichbar.',
  retry: 'Erneut versuchen',
  remaining: formatRemainingDe
};

export interface HeimvioExtensionOptions {
  /** The extension's slug (`/apps/<slug>/`), same as `HEIMVIO_EXT_SLUG`. */
  slug: string;
  /** Runtime configuration of heimvio; default `/config.json` of the origin. */
  configUrl?: string;
  /** PostgREST base path; default `/api`. */
  apiBase?: string;
  /** heimvio sidecar base path; default `/heimvio`. */
  sidecarBase?: string;
  /** Where "back to heimvio" points; default `/`. */
  homeUrl?: string;
  /** Where "not installed" points; default `/settings/org`. */
  settingsUrl?: string;
  /** How often the installation is re-checked (ms); default 60 000. */
  recheckMs?: number;
  labels?: Partial<ExtensionShellLabels>;
}

export interface HeimvioExtensionConfig {
  slug: string;
  configUrl: string;
  apiBase: string;
  sidecarBase: string;
  homeUrl: string;
  settingsUrl: string;
  recheckMs: number;
  labels: ExtensionShellLabels;
}

export const HEIMVIO_EXTENSION_CONFIG = new InjectionToken<HeimvioExtensionConfig>('HEIMVIO_EXTENSION_CONFIG');

export function resolveExtensionConfig(o: HeimvioExtensionOptions): HeimvioExtensionConfig {
  return {
    slug: o.slug,
    configUrl: o.configUrl ?? '/config.json',
    apiBase: o.apiBase ?? '/api',
    sidecarBase: o.sidecarBase ?? '/heimvio',
    homeUrl: o.homeUrl ?? '/',
    settingsUrl: o.settingsUrl ?? '/settings/org',
    recheckMs: o.recheckMs ?? 60_000,
    labels: { ...DEFAULT_SHELL_LABELS, ...(o.labels ?? {}) }
  };
}
