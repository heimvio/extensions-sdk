import { EnvironmentProviders, Provider, inject, provideAppInitializer } from '@angular/core';
import { OAuthStorage } from 'angular-oauth2-oidc';
import { provideAuth } from '@heimvio/zitadel-pgrst-angular/auth';
import { HEIMVIO_EXTENSION_CONFIG, HeimvioExtensionOptions, resolveExtensionConfig } from './config';
import { HeimvioExtension } from './extension.service';
import { extensionBasePath } from './logic';
import { heimvioTrace } from './trace';

/**
 * Everything an extension's Angular app needs to run with heimvio's session:
 *
 * - the auth building block of `@heimvio/zitadel-pgrst-angular` with
 *   heimvio's `/config.json` (absolute — the app lives below `/apps/<slug>/`),
 *   PostgREST pinned to `/api` and an `X-Trace-Id` on its own calls,
 * - token storage in `localStorage` like heimvio's SPA, so the session of the
 *   origin is found without a redirect (and the PKCE state survives the
 *   round trip through heimvio's `/callback`),
 * - the installation gate (`HeimvioExtension.start()`) as app initializer.
 *
 * ```ts
 * bootstrapApplication(App, { providers: [...provideHeimvioExtension({ slug: 'hello' })] });
 * ```
 */
export function provideHeimvioExtension(options: HeimvioExtensionOptions): Array<Provider | EnvironmentProviders> {
  extensionBasePath(options.slug); // throws on an invalid slug
  const cfg = resolveExtensionConfig(options);
  return [
    { provide: HEIMVIO_EXTENSION_CONFIG, useValue: cfg },
    ...provideAuth({
      configUrl: cfg.configUrl,
      afterConfigLoaded: rc => {
        rc.postgrest.url = cfg.apiBase;
        rc.extraHeaders = () => ({ 'X-Trace-Id': heimvioTrace.next() });
      }
    }),
    // AFTER provideAuth(): overrides the default storage of provideOAuthClient().
    { provide: OAuthStorage, useFactory: () => localStorage },
    provideAppInitializer(() => {
      const ext = inject(HeimvioExtension);
      return ext.start();
    })
  ];
}
