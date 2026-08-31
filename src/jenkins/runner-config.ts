import type { BrowserName, LocatorSelector } from '../types.js';

export interface JenkinsRunnerSelectors {
  readonly authLandmark: LocatorSelector;
}

export interface JenkinsRunnerConfig {
  readonly baseUrl: string;
  readonly loginUrl: string;
  readonly jobUrl: string;
  readonly username: string;
  readonly password: string;
  readonly timeoutMs: number;
  readonly browser: BrowserName;
  readonly selectors: JenkinsRunnerSelectors;
}

export const DEFAULT_JENKINS_RUNNER_SELECTORS: JenkinsRunnerSelectors = {
  authLandmark: {
    kind: 'role',
    value: 'link',
    name: 'Manage Jenkins',
    required: true,
  },
};
