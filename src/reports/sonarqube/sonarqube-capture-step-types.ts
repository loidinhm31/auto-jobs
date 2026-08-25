import type { Page } from '@playwright/test';

import type { NormalizedProjectConfig } from '../../config/config-types.js';
import type { CaptureMetadata, NavigationTarget, SonarIssueFacets } from '../../result-types.js';
import type { WorkflowDeadline } from '../../workflow/workflow-deadline.js';

export interface SonarStepInput {
  page: Page;
  project: NormalizedProjectConfig;
  expectedKey: string;
  deadline: WorkflowDeadline;
  outputDirectory: string;
}

export interface SonarStepResult {
  capture: CaptureMetadata;
  navigation: NavigationTarget;
  screenshot?: string;
  warnings: string[];
}

export interface SonarIssuesStepResult extends SonarStepResult {
  facets: SonarIssueFacets;
}
