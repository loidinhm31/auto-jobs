export interface RichFixtureOptions {
  readonly projectId?: string;
  readonly projectName?: string;
  readonly runId?: string;
  readonly findingsCount?: number;
  readonly includeScreenshots?: boolean;
  readonly missingScreenshotFile?: boolean;
  readonly includeVietnameseUnicode?: boolean;
  readonly multipleLinksPerCell?: boolean;
  readonly customWarnings?: readonly string[];
}

export const FIXTURE_SNYK_SCREENSHOT = 'snyk-test-report.png';
export const FIXTURE_SONAR_OVERALL_SCREENSHOT = 'sonarqube-overall.png';
export const FIXTURE_SONAR_ISSUES_SCREENSHOT = 'sonarqube-issues.png';

export const FIXTURE_JENKINS_URL =
  'https://jenkins.example/job/Container%20Platform/job/ID/job/job-id/job/Service%20Name/job/Build/job/Build%20ID%20Service%20Name/job/release%252Fsit/';
export const FIXTURE_SNYK_LIVE_URL = 'https://snyk.example/org/payment-service/project/1111-2222';
export const FIXTURE_SONAR_HOME_URL = 'https://sonar.example/dashboard?id=payment-service';
export const FIXTURE_SONAR_OVERALL_URL = 'https://sonar.example/overview?id=payment-service';
export const FIXTURE_SONAR_ISSUES_URL = 'https://sonar.example/issues?id=payment-service';
