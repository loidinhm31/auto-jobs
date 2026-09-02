import type { BrowserName, LocatorSelector } from '../types.js';

export interface JenkinsRunnerSelectors {
  readonly authLandmark: LocatorSelector;
  readonly buildParametersLink: LocatorSelector;
  readonly buildSubmitButton: LocatorSelector;
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
  buildParametersLink: {
    kind: 'role',
    value: 'link',
    name: 'Build with Parameters',
    required: true,
  },
  buildSubmitButton: {
    kind: 'role',
    value: 'button',
    name: 'Build',
    required: true,
  },
};
