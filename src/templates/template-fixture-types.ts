export interface TemplateReportFixture {
  readonly loginUrl: string;
  readonly loginActionUrl: string;
  readonly jobUrl: string;
  readonly buildPageUrl: string;
  readonly buildActionUrl: string;
  readonly snykReportUrl: string;
  readonly snykSummaryUrl: string;
  readonly sonarqubeLoginUrl: string;
  readonly sonarqubeLoginActionUrl: string;
  readonly sonarqubeHomeUrl: string;
  readonly sonarqubeOverallUrl: string;
  readonly sonarqubeIssuesUrl: string;
  readonly loginHtml: string;
  readonly jenkinsHtml: string;
  readonly buildHtml: string;
  readonly snykHtml: string;
  readonly snykSummary: string;
  readonly sonarqubeLoginHtml: string;
  readonly sonarqubeHomeHtml: string;
  readonly sonarqubeOverallHtml: string;
  readonly sonarqubeIssuesHtml: string;
  readonly jenkinsTitle: string;
  readonly sonarqubeProjectId: string;
}

export interface TemplateResponse {
  readonly body: string;
  readonly contentType: string;
}

export interface TemplateRouteMiss {
  readonly method: string;
  readonly origin: string;
  readonly pathname: string;
}

export interface TemplateRouteRecorder {
  readonly misses: readonly TemplateRouteMiss[];
  readonly truncated: boolean;
}

export interface MutableTemplateRouteRecorder {
  readonly misses: TemplateRouteMiss[];
  truncated: boolean;
}

export interface FileIdentity {
  readonly dev: number;
  readonly ino: number;
}

export interface TemplateReadBudget {
  bytes: number;
}

export interface ArtifactLink {
  readonly url: URL;
  readonly context: string;
  readonly filename: string;
}

export interface SonarqubeRouteMap {
  readonly projectId: string;
  readonly homeUrl: string;
  readonly overallUrl: string;
  readonly issuesUrl: string;
}
