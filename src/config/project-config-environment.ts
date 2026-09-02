import { ConfigError } from '../config-errors.js';
import type {
  NormalizedProjectConfig,
  ProjectSecrets,
} from './config-types.js';

export const LEGACY_STRUCTURE_ENVIRONMENT_KEYS: Record<string, true> = {
  REPORT_SOURCE: true,
  PROJECTS_CONFIG_PATH: true,
  JENKINS_BASE_URL: true,
  JENKINS_JOB_PATH: true,
  JENKINS_BUILD_NUMBER: true,
  JENKINS_LOGIN_PATH: true,
  JENKINS_TRIGGER_MODE: true,
  JENKINS_TIMEOUT_MS: true,
  JENKINS_POLL_INTERVAL_MS: true,
  PLAYWRIGHT_BROWSER: true,
  ARTIFACT_DIR: true,
  PROJECT_ID: true,
  PROJECT_NAME: true,
  JENKINS_USERNAME_VARIABLE: true,
  JENKINS_PASSWORD_VARIABLE: true,
  JENKINS_TRIGGER_SELECTOR: true,
  JENKINS_AUTH_LANDMARK: true,
  JENKINS_QUEUE_URL_SELECTOR: true,
  JENKINS_BUILD_STATUS_SELECTOR: true,
  JENKINS_BUILD_URL_SELECTOR: true,
  SONAR_REPORT_SELECTOR: true,
  SNYK_REPORT_SELECTOR: true,
  SNYK_ALLOWED_ORIGINS: true,
  SNYK_PROJECT_ID: true,
  SONARQUBE_ALLOWED_ORIGINS: true,
  SONARQUBE_PROJECT_ID: true,
};

export function assertNoLegacyEnvironmentInputs(env: NodeJS.ProcessEnv): void {
  if (Object.keys(LEGACY_STRUCTURE_ENVIRONMENT_KEYS).some((key) => env[key]?.trim())) {
    throw new ConfigError(['legacy environment configuration is not supported; use --config <path>']);
  }
}

export function resolveProjectSecrets(
  project: Pick<NormalizedProjectConfig, 'credentialVariables'>,
  env: NodeJS.ProcessEnv = process.env,
): ProjectSecrets {
  const issues: string[] = [];
  const username = env[project.credentialVariables.usernameVariable];
  const password = env[project.credentialVariables.passwordVariable];
  if (username === undefined || username.length === 0) {
    issues.push(`${project.credentialVariables.usernameVariable} is required`);
  }
  if (password === undefined || password.length === 0) {
    issues.push(`${project.credentialVariables.passwordVariable} is required`);
  }
  if (issues.length > 0) throw new ConfigError(issues);
  return Object.freeze({ username: username as string, password: password as string });
}
