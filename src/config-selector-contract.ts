import type {
  LocatorSelector,
  SelectorConfig,
} from './types.js';

import {
  DEFAULT_SELECTORS,
  parseSelectorEnv,
} from './config-selectors.js';

type OptionalReader = (
  env: NodeJS.ProcessEnv,
  key: string,
) => string | undefined;

export function parseSelectorConfig(
  env: NodeJS.ProcessEnv,
  issues: string[],
  readOptional: OptionalReader,
): SelectorConfig {
  const selector = (
    key: string,
    fallback: LocatorSelector,
    required: boolean,
  ): LocatorSelector =>
    parseSelectorEnv(env, key, issues, fallback, required, readOptional);

  return {
    trigger: selector(
      'JENKINS_TRIGGER_SELECTOR',
      DEFAULT_SELECTORS.trigger,
      false,
    ),
    authLandmark: selector(
      'JENKINS_AUTH_LANDMARK',
      DEFAULT_SELECTORS.authLandmark,
      false,
    ),
    queueUrl: selector(
      'JENKINS_QUEUE_URL_SELECTOR',
      DEFAULT_SELECTORS.queueUrl,
      false,
    ),
    buildStatus: selector(
      'JENKINS_BUILD_STATUS_SELECTOR',
      DEFAULT_SELECTORS.buildStatus,
      false,
    ),
    buildUrl: selector(
      'JENKINS_BUILD_URL_SELECTOR',
      DEFAULT_SELECTORS.buildUrl,
      false,
    ),
    sonarqubeReport: selector(
      'SONAR_REPORT_SELECTOR',
      DEFAULT_SELECTORS.sonarqubeReport,
      true,
    ),
    snykReport: selector(
      'SNYK_REPORT_SELECTOR',
      DEFAULT_SELECTORS.snykReport,
      true,
    ),
  };
}
