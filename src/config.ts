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
  loadProjectConfigWithDocument,
  normalizeProjectConfigDocument,
  resolveProjectSecrets,
} from './config/project-config-loader.js';
export type { LoadedProjectConfigDocument } from './config/project-config-loader.js';
export {
  selectAutoBuildProject,
  selectAutoBuildProjects,
  selectReportProjects,
} from './config/project-run-selection.js';
export {
  DEFAULT_REPORT_WORKERS,
  MAX_REPORT_WORKERS,
  normalizeReportWorkerCount,
} from './config/report-worker-count.js';

export type {
  JobColumnInput,
  NormalizedProjectConfig,
  NormalizedSourceConfig,
  ProjectConfigDefaults,
  ProjectConfigDocumentV1,
  ProjectConfigInput,
  ProjectGroupInput,
  ProjectCredentialReferences,
  ProjectOriginPolicies,
  ProjectSecrets,
  ProjectSourceInput,
  RunType,
} from './config/config-types.js';
export {
  assertProjectConfigDocument,
  COLUMN_ID_REGEX,
  COLUMN_KEYS,
  GROUP_ID_REGEX,
  GROUP_KEYS,
  PROJECT_CONFIG_LIMITS,
  validateJobColumn,
  validateJobMatrix,
  validateProjectGroup,
  validateProjectGroups,
  validateProjectJobMatrix,
} from './config/project-config-schema.js';
export {
  DEFAULT_JOB_COLUMN,
  projectLegacyMatrixDocument,
} from './config/project-job-matrix-upgrade.js';

export {
  assertAllowedUrl,
  assertSameOrigin,
  containsPathTraversal,
  canonicalizeBaseUrl,
  canonicalizeOrigin,
  isWithinBasePath,
} from './security/url-policy.js';
export { resolveSafeRelativeUrl } from './security/relative-url-policy.js';
