import * as fs from 'node:fs';
import * as path from 'node:path';
import { generatedReportImage } from '../../e2e/generated-report-image.js';
import { AGGREGATE_REPORT_MARKER } from '../../../src/reporting/report-server-constants.js';
import {
  type RichFixtureOptions,
  FIXTURE_SNYK_SCREENSHOT,
  FIXTURE_SONAR_OVERALL_SCREENSHOT,
  FIXTURE_SONAR_ISSUES_SCREENSHOT,
  FIXTURE_JENKINS_URL,
  FIXTURE_SNYK_LIVE_URL,
  FIXTURE_SONAR_HOME_URL,
  FIXTURE_SONAR_OVERALL_URL,
  FIXTURE_SONAR_ISSUES_URL,
} from './report-pdf-fixture-constants.js';

export {
  type RichFixtureOptions,
  FIXTURE_SNYK_SCREENSHOT,
  FIXTURE_SONAR_OVERALL_SCREENSHOT,
  FIXTURE_SONAR_ISSUES_SCREENSHOT,
  FIXTURE_JENKINS_URL,
  FIXTURE_SNYK_LIVE_URL,
  FIXTURE_SONAR_HOME_URL,
  FIXTURE_SONAR_OVERALL_URL,
  FIXTURE_SONAR_ISSUES_URL,
};

export function initReportRoot(reportRoot: string): void {
  fs.writeFileSync(
    path.join(reportRoot, 'index.html'),
    `<!DOCTYPE html><html><head>${AGGREGATE_REPORT_MARKER}</head><body>Index</body></html>`,
    'utf8',
  );
  fs.writeFileSync(
    path.join(reportRoot, 'aggregate-data.json'),
    JSON.stringify({ schemaVersion: 3, generatedAt: '2026-09-26T10:00:00.000Z', projects: [], warnings: [] }),
    'utf8',
  );
}

function buildFindings(count: number, isVietnamese: boolean, multipleLinks: boolean) {
  const findings = [];
  for (let i = 1; i <= count; i++) {
    const isHigh = i % 2 === 1;
    const severity = isHigh ? 'high' : 'medium';
    const id = `SNYK-JS-FIXTURE-${i.toString().padStart(3, '0')}`;
    const title = isVietnamese
      ? `Lỗ hổng bảo mật thực thi mã từ xa ${i}: Phát hiện gói phụ thuộc nguy hiểm`
      : `Vulnerability remote execution finding ${i}: dangerous dependency identified`;
    const description = isVietnamese
      ? `Mô tả chi tiết lỗ hổng bảo mật số ${i}. Cần xử lý khẩn cấp trước khi bàn giao phần mềm.`
      : `Detailed vulnerability description for item ${i}. Requires urgent remediation before release.`;
    const remediation = isVietnamese
      ? `Nâng cấp phiên bản thư viện lên >= 2.4.0 hoặc áp dụng bản vá lỗi bảo mật.`
      : `Upgrade package version to >= 2.4.0 or apply security patch.`;

    const references = [`https://security.example/advisory/${id}`];
    if (multipleLinks) {
      references.push(`https://cve.mitre.org/cve/CVE-2026-${1000 + i}`);
    }

    findings.push({
      id,
      title,
      severity,
      module: `lib-sec-${i}`,
      description,
      remediation,
      paths: [`package.json > lib-sec-${i}`],
      references,
    });
  }
  return findings;
}

export function createRichRunFiles(reportRoot: string, options: RichFixtureOptions = {}): {
  readonly projectId: string;
  readonly runId: string;
  readonly dir: string;
} {
  const projectId = options.projectId ?? 'service-vn';
  const runId = options.runId ?? '20260926_100000';
  const isVietnamese = options.includeVietnameseUnicode !== false;
  const projectName = options.projectName ?? (isVietnamese ? 'Dự án thanh toán bảo mật (VN-PAY) · Đã kiểm thử' : 'Service Payment Secure');
  const findingsCount = options.findingsCount ?? 2;
  const includeScreenshots = options.includeScreenshots ?? true;
  const missingScreenshotFile = options.missingScreenshotFile ?? false;

  const dir = path.join(reportRoot, projectId, runId);
  fs.mkdirSync(dir, { recursive: true });

  const screenshots = includeScreenshots
    ? [FIXTURE_SNYK_SCREENSHOT, FIXTURE_SONAR_OVERALL_SCREENSHOT, FIXTURE_SONAR_ISSUES_SCREENSHOT]
    : [];

  if (includeScreenshots && !missingScreenshotFile) {
    const pngBytes = generatedReportImage();
    fs.writeFileSync(path.join(dir, FIXTURE_SNYK_SCREENSHOT), pngBytes);
    fs.writeFileSync(path.join(dir, FIXTURE_SONAR_OVERALL_SCREENSHOT), pngBytes);
    fs.writeFileSync(path.join(dir, FIXTURE_SONAR_ISSUES_SCREENSHOT), pngBytes);
  }

  const findings = buildFindings(findingsCount, isVietnamese, options.multipleLinksPerCell !== false);

  const snykCaptures = includeScreenshots
    ? [{ url: FIXTURE_SNYK_LIVE_URL, title: isVietnamese ? 'Ảnh chụp báo cáo Snyk kiểm thử' : 'Snyk test report', capturedAt: '2026-09-26T10:00:00.000Z', selectorStrategy: 'fixture', screenshotPath: FIXTURE_SNYK_SCREENSHOT }]
    : [];

  const sonarCaptures = includeScreenshots
    ? [
        { url: FIXTURE_SONAR_OVERALL_URL, title: isVietnamese ? 'Ảnh chụp tổng quan SonarQube' : 'SonarQube overview', capturedAt: '2026-09-26T10:00:00.000Z', selectorStrategy: 'fixture', screenshotPath: FIXTURE_SONAR_OVERALL_SCREENSHOT },
        { url: FIXTURE_SONAR_ISSUES_URL, title: isVietnamese ? 'Ảnh chụp danh sách lỗi SonarQube' : 'SonarQube issues', capturedAt: '2026-09-26T10:00:00.000Z', selectorStrategy: 'fixture', screenshotPath: FIXTURE_SONAR_ISSUES_SCREENSHOT },
      ]
    : [];

  const navigation = {
    'jenkins-job': { key: 'jenkins-job' as const, localAnchor: '#jenkins', state: 'found' as const, liveUrl: FIXTURE_JENKINS_URL },
    'snyk-report': { key: 'snyk-report' as const, localAnchor: '#snyk-test-report', state: 'found' as const, liveUrl: FIXTURE_SNYK_LIVE_URL },
    'sonarqube-home': { key: 'sonarqube-home' as const, localAnchor: '#sonarqube-home', state: 'found' as const, liveUrl: FIXTURE_SONAR_HOME_URL },
    'sonarqube-overall': { key: 'sonarqube-overall' as const, localAnchor: '#sonarqube-overall', state: 'found' as const, liveUrl: FIXTURE_SONAR_OVERALL_URL },
    'sonarqube-issues': { key: 'sonarqube-issues' as const, localAnchor: '#sonarqube-issues', state: 'found' as const, liveUrl: FIXTURE_SONAR_ISSUES_URL },
  };

  const isPartial = options.customWarnings !== undefined && options.customWarnings.length > 0;
  const state = isPartial ? 'partial' : 'success';
  const warnings = isPartial ? [...options.customWarnings!] : [];

  const dataJson = {
    schemaVersion: 3,
    project: { id: projectId, name: projectName },
    run: { runId, observedAt: '2026-09-26T10:00:00.000Z' },
    state,
    jenkins: { jobUrl: FIXTURE_JENKINS_URL },
    navigation,
    reports: {
      snyk: {
        state: 'found', captures: snykCaptures, navigation: [navigation['snyk-report']], warnings: [],
        summary: { counts: { critical: 0, high: Math.ceil(findingsCount / 2), medium: Math.floor(findingsCount / 2), low: 0 }, detail: { totalObserved: findingsCount, retainedCount: findingsCount, truncated: false, omittedCount: 0 }, metadata: { packageManager: 'npm', dependencyCount: 88 } },
        findings,
      },
      sonarqube: {
        state: 'found', captures: sonarCaptures, navigation: [navigation['sonarqube-home'], navigation['sonarqube-overall'], navigation['sonarqube-issues']], warnings: [],
        facets: { types: [{ label: 'Bug', count: 2 }, { label: 'Vulnerability', count: 1 }], severities: [{ label: 'Critical', count: 1 }, { label: 'Major', count: 2 }] },
      },
    },
    warnings,
  };

  const manifestJson = {
    kind: 'project-run', schemaVersion: 3, project: { id: projectId, name: projectName }, run: { runId, observedAt: '2026-09-26T10:00:00.000Z' }, state,
    jenkins: { jobUrl: FIXTURE_JENKINS_URL }, artifacts: { manifest: 'manifest.json', data: 'data.json', screenshots }, warnings,
  };

  fs.writeFileSync(path.join(dir, 'data.json'), JSON.stringify(dataJson, null, 2), 'utf8');
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifestJson, null, 2), 'utf8');
  fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><html><head><meta charset="utf-8"><title>Static Report</title></head><body><h1>Scriptless Static Report Content</h1></body></html>', 'utf8');

  return { projectId, runId, dir };
}
