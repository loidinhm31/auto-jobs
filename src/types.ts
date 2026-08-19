export type ReportState = 'found' | 'not_found' | 'incomplete';

export type SelectorKind = 'role' | 'label' | 'testId' | 'text' | 'css';

export type BrowserName = 'chromium' | 'firefox' | 'webkit';

export type TriggerMode = 'ui';

export interface LocatorSelector {
  kind: SelectorKind;
  value: string;
  name?: string;
  required: boolean;
}

export interface SelectorConfig {
  trigger: LocatorSelector;
  authLandmark: LocatorSelector;
  queueUrl: LocatorSelector;
  buildStatus: LocatorSelector;
  buildUrl: LocatorSelector;
  sonarqubeReport: LocatorSelector;
  snykReport: LocatorSelector;
}

export interface Report {
  state: ReportState;
  urls: string[];
  text: string[];
}

export interface BuildReference {
  number: number;
  url: string;
  queueUrl?: string;
}

export interface BuildTriggerResult {
  triggered: boolean;
  queueUrl?: string;
  build?: BuildReference;
}

export interface BuildTrigger {
  trigger(): Promise<BuildTriggerResult>;
}

export interface VulnerabilityReportResult {
  schemaVersion: 1;
  jenkins: {
    baseUrl: string;
    jobPath: string;
    jobUrl: string;
    buildNumber: number;
    buildUrl: string;
    status: string;
  };
  reports: {
    sonarqube: Report;
    snyk: Report;
  };
  triggered: boolean;
  observedAt: string;
}
