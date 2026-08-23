import { parseConfig } from './legacy-runner-config.js';
import type {
  ProjectConfigDocumentV1,
  ProjectConfigInput,
} from './config-types.js';

const LEGACY_INPUT_KEYS = [
  'JENKINS_BASE_URL',
  'JENKINS_JOB_PATH',
  'JENKINS_BUILD_NUMBER',
  'JENKINS_LOGIN_PATH',
  'JENKINS_TRIGGER_MODE',
  'JENKINS_TIMEOUT_MS',
  'JENKINS_POLL_INTERVAL_MS',
  'PLAYWRIGHT_BROWSER',
  'ARTIFACT_DIR',
  'PROJECT_ID',
  'PROJECT_NAME',
  'JENKINS_USERNAME_VARIABLE',
  'JENKINS_PASSWORD_VARIABLE',
  'JENKINS_TRIGGER_SELECTOR',
  'JENKINS_AUTH_LANDMARK',
  'JENKINS_QUEUE_URL_SELECTOR',
  'JENKINS_BUILD_STATUS_SELECTOR',
  'JENKINS_BUILD_URL_SELECTOR',
  'SONAR_REPORT_SELECTOR',
  'SNYK_REPORT_SELECTOR',
  'SNYK_ALLOWED_ORIGINS',
  'SONARQUBE_ALLOWED_ORIGINS',
] as const;

function optional(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const value = env[key]?.trim();
  return value && value.length > 0 ? value : undefined;
}

function originList(env: NodeJS.ProcessEnv, key: string): string[] | undefined {
  const value = optional(env, key);
  if (value === undefined) return undefined;
  return value.split(',').map((origin) => origin.trim()).filter(Boolean);
}

export function hasLegacyProjectInputs(env: NodeJS.ProcessEnv): boolean {
  return LEGACY_INPUT_KEYS.some((key) => optional(env, key) !== undefined);
}

export function legacyProjectConfigDocument(
  env: NodeJS.ProcessEnv = process.env,
): ProjectConfigDocumentV1 {
  const legacy = parseConfig(env);
  const project: ProjectConfigInput = {
    id: optional(env, 'PROJECT_ID') || 'legacy-jenkins-project',
    name: optional(env, 'PROJECT_NAME') || 'Legacy Jenkins project',
    enabled: true,
    baseUrl: legacy.baseUrl,
    jobPath: legacy.jobPath,
    loginPath: legacy.loginPath,
    triggerMode: legacy.triggerMode,
    timeoutMs: legacy.timeoutMs,
    pollIntervalMs: legacy.pollIntervalMs,
    browser: legacy.browser,
    artifactDir: legacy.artifactDir,
    selectors: legacy.selectors,
    credentials: {
      usernameVariable: optional(env, 'JENKINS_USERNAME_VARIABLE') || 'JENKINS_USERNAME',
      passwordVariable: optional(env, 'JENKINS_PASSWORD_VARIABLE') || 'JENKINS_PASSWORD',
    },
  };
  if (legacy.buildNumber !== undefined) project.buildNumber = legacy.buildNumber;
  const snykOrigins = originList(env, 'SNYK_ALLOWED_ORIGINS');
  const sonarOrigins = originList(env, 'SONARQUBE_ALLOWED_ORIGINS');
  if (snykOrigins !== undefined || sonarOrigins !== undefined) {
    project.sourceOrigins = {};
    if (snykOrigins !== undefined) project.sourceOrigins.snyk = snykOrigins;
    if (sonarOrigins !== undefined) project.sourceOrigins.sonarqube = sonarOrigins;
  }
  return { schemaVersion: 1, projects: [project] };
}

export function normalizeLegacyProjectConfig(
  env: NodeJS.ProcessEnv = process.env,
): readonly ProjectConfigInput[] {
  return legacyProjectConfigDocument(env).projects;
}
