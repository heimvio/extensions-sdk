/*
 * Public API of @heimvio/ext-sdk-angular.
 */
export { provideHeimvioExtension } from './lib/provide';
export { HeimvioApi, HeimvioApiError } from './lib/api';
export type { QueryValue } from './lib/api';
export { HeimvioExtension } from './lib/extension.service';
export type { ExtensionState } from './lib/extension.service';
export { HeimvioExtensionShellComponent } from './lib/shell.component';
export {
  HEIMVIO_EXTENSION_CONFIG,
  DEFAULT_SHELL_LABELS,
  resolveExtensionConfig
} from './lib/config';
export type { HeimvioExtensionOptions, HeimvioExtensionConfig, ExtensionShellLabels } from './lib/config';
export { HeimvioTrace, heimvioTrace } from './lib/trace';
export {
  SLUG_PATTERN,
  RETURN_PATH_PATTERN,
  TRACE_ID_PATTERN,
  isValidSlug,
  extensionBasePath,
  isExtensionReturnPath,
  extensionReturnPath,
  returnPathFromOAuthState,
  remainingMs,
  formatRemainingDe
} from './lib/logic';
export type { ExtensionMe } from './lib/logic';
