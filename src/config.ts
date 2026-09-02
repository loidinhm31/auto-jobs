export {
  ConfigError,
  formatDiagnostic,
  redactText,
  sanitizeUrl,
} from './config-errors.js';

export {
  deriveJenkinsBaseUrl,
  normalizeConfiguredUrl,
  parseBrowserName,
  parsePositiveInteger,
} from './config-values.js';

export {
  loadProjectConfig,
  normalizeProjectConfigDocument,
  resolveProjectSecrets,
} from './config/project-config-loader.js';
export {
  selectAutoBuildProject,
  selectReportProjects,
} from './config/project-run-selection.js';

export type {
  NormalizedProjectConfig,
  NormalizedSourceConfig,
  ProjectConfigDefaults,
  ProjectConfigDocumentV1,
  ProjectConfigInput,
  ProjectCredentialReferences,
  ProjectOriginPolicies,
  ProjectSecrets,
  ProjectSourceInput,
  RunType,
} from './config/config-types.js';
export {
  assertProjectConfigDocument,
  PROJECT_CONFIG_LIMITS,
} from './config/project-config-schema.js';

export {
  assertAllowedUrl,
  assertSameOrigin,
  containsPathTraversal,
  canonicalizeBaseUrl,
  canonicalizeOrigin,
  isWithinBasePath,
} from './security/url-policy.js';
export { resolveSafeRelativeUrl } from './security/relative-url-policy.js';
