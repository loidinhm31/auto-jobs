import type { BrowserName, LocatorSelector } from '../types.js';

export interface JenkinsRunnerSelectors {
  readonly trigger: LocatorSelector;
  readonly authLandmark: LocatorSelector;
  readonly queueUrl: LocatorSelector;
  readonly buildStatus: LocatorSelector;
  readonly buildUrl: LocatorSelector;
  readonly sonarqubeReport: LocatorSelector;
  readonly snykReport: LocatorSelector;
}

export interface JenkinsRunnerConfig {
  readonly baseUrl: string;
  readonly loginUrl: string;
  readonly jobUrl: string;
  readonly username: string;
  readonly password: string;
  readonly timeoutMs: number;
  readonly pollIntervalMs: number;
  readonly browser: BrowserName;
  readonly artifactDir: string;
  readonly selectors: JenkinsRunnerSelectors;
  readonly buildNumber?: number;
}

export const DEFAULT_JENKINS_RUNNER_SELECTORS: JenkinsRunnerSelectors = {
  trigger: {
    kind: 'role',
    value: 'button',
    name: 'Build Now',
    required: true,
  },
  authLandmark: {
    kind: 'role',
    value: 'link',
    name: 'Manage Jenkins',
    required: false,
  },
  queueUrl: {
    kind: 'css',
    value: 'a[href*="/queue/item/"]',
    required: false,
  },
  buildStatus: {
    kind: 'testId',
    value: 'jenkins-build-status',
    required: true,
  },
  buildUrl: {
    kind: 'testId',
    value: 'jenkins-build-url',
    required: true,
  },
  sonarqubeReport: {
    kind: 'testId',
    value: 'sonarqube-report',
    required: true,
  },
  snykReport: {
    kind: 'testId',
    value: 'snyk-report',
    required: true,
  },
};
