import * as http from 'node:http';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { AddressInfo } from 'node:net';

import { ArtifactPaths } from '../../src/artifacts/artifact-paths.js';
import { writeAggregateDataPair } from '../../src/artifacts/aggregate-report-publisher.js';
import { writeProjectResult } from '../../src/artifacts/result-writer.js';
import type { ProjectRunManifest } from '../../src/artifacts/artifact-manifest.js';
import type { AggregateReportResult, VulnerabilityReportResultV2 } from '../../src/result-types.js';
import { generatedReportImage } from './generated-report-image.js';

const RUN_ID = '20260824t040000z-0000000000000042';
const BUILD_NUMBER = 42;
const OBSERVED_AT = '2026-08-24T04:00:00.000Z';
const BUILD_URL = 'https://jenkins.example/job/service-a/42/';
const SNYK_SCREENSHOT = 'snyk-test-report.png';
const SONAR_OVERALL_SCREENSHOT = 'sonarqube-overall.png';
const SONAR_ISSUES_SCREENSHOT = 'sonarqube-issues.png';
const SCREENSHOTS = [SNYK_SCREENSHOT, SONAR_OVERALL_SCREENSHOT, SONAR_ISSUES_SCREENSHOT] as const;

function generatedReportResult(): VulnerabilityReportResultV2 {
  const navigation = {
    'jenkins-build': { key: 'jenkins-build' as const, localAnchor: '#jenkins', state: 'found' as const, liveUrl: BUILD_URL },
    'snyk-report': { key: 'snyk-report' as const, localAnchor: '#snyk-test-report', state: 'found' as const, liveUrl: 'https://snyk.example/org/service-a' },
    'sonarqube-home': { key: 'sonarqube-home' as const, localAnchor: '#sonarqube-home', state: 'found' as const, liveUrl: 'https://sonarqube.example/dashboard?id=service-a' },
    'sonarqube-overall': { key: 'sonarqube-overall' as const, localAnchor: '#sonarqube-overall', state: 'found' as const, liveUrl: 'https://sonarqube.example/overview?id=service-a' },
    'sonarqube-issues': { key: 'sonarqube-issues' as const, localAnchor: '#sonarqube-issues', state: 'found' as const, liveUrl: 'https://sonarqube.example/issues?id=service-a' },
  };
  return {
    schemaVersion: 2,
    state: 'success',
    project: { id: 'service-a', name: 'Service <A>' },
    run: { runId: RUN_ID, observedAt: OBSERVED_AT },
    jenkins: {
      baseUrl: 'https://jenkins.example', jobPath: 'job/service-a', jobUrl: 'https://jenkins.example/job/service-a/',
      buildNumber: BUILD_NUMBER, buildUrl: BUILD_URL, status: 'SUCCESS',
      trigger: { capability: 'build_now', triggerAttempts: 1, build: { number: BUILD_NUMBER, url: BUILD_URL }, submittedAt: OBSERVED_AT, correlatedAt: OBSERVED_AT, warnings: [] },
    },
    navigation,
    reports: {
      snyk: {
        state: 'found', captures: [{ url: 'https://snyk.example/org/service-a', title: 'Snyk report', capturedAt: OBSERVED_AT, selectorStrategy: 'fixture', screenshotPath: SNYK_SCREENSHOT }],
        navigation: [navigation['snyk-report']], warnings: [],
        summary: { counts: { critical: 1, high: 2, medium: 3, low: 4 }, detail: { totalObserved: 1, retainedCount: 1, truncated: false, omittedCount: 0 }, metadata: { packageManager: 'npm', dependencyCount: 24 } },
        findings: [{ id: 'SNYK-JS-FIXTURE-1', title: 'Fixture dependency issue', severity: 'high', module: '<dependency>', description: 'A fixture finding for browser validation.', remediation: 'Upgrade the dependency.', paths: ['package.json'], references: ['https://security.example/advisory/SNYK-JS-FIXTURE-1'] }],
      },
      sonarqube: {
        state: 'found', captures: [
          { url: 'https://sonarqube.example/dashboard?id=service-a', title: 'SonarQube overview', capturedAt: OBSERVED_AT, selectorStrategy: 'fixture', screenshotPath: SONAR_OVERALL_SCREENSHOT },
          { url: 'https://sonarqube.example/issues?id=service-a', title: 'SonarQube issues', capturedAt: OBSERVED_AT, selectorStrategy: 'fixture', screenshotPath: SONAR_ISSUES_SCREENSHOT },
        ], navigation: [navigation['sonarqube-home'], navigation['sonarqube-overall'], navigation['sonarqube-issues']], warnings: [],
        facets: { types: [{ label: 'Bug', count: 2 }], severities: [{ label: 'Major', count: 2 }] },
      },
    },
    warnings: [],
  };
}

function generatedManifest(): ProjectRunManifest {
  return {
    kind: 'project-run', schemaVersion: 2, project: { id: 'service-a', name: 'Service <A>' }, run: { runId: RUN_ID, observedAt: OBSERVED_AT }, state: 'success',
    jenkins: { buildNumber: BUILD_NUMBER, buildUrl: BUILD_URL, status: 'SUCCESS' },
    artifacts: { manifest: 'manifest.json', data: 'data.json', screenshots: SCREENSHOTS }, warnings: [],
  };
}

function contentType(filename: string): string {
  if (filename.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filename.endsWith('.json')) return 'application/json; charset=utf-8';
  if (filename.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filename.endsWith('.png')) return 'image/png';
  return 'application/octet-stream';
}

async function listen(root: string): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = http.createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://fixture').pathname);
      const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
      const filename = path.resolve(root, relative);
      if (filename !== root && !filename.startsWith(`${root}${path.sep}`)) { response.writeHead(400).end(); return; }
      const body = await fs.readFile(filename);
      response.writeHead(200, { 'Content-Security-Policy': "frame-ancestors 'none'", 'Content-Type': contentType(filename), 'Cache-Control': 'no-store' }).end(body);
    } catch {
      response.writeHead(404).end('not found');
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  return { baseUrl: `http://127.0.0.1:${address.port}`, close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())) };
}

export async function createGeneratedReportFixture(): Promise<{ baseUrl: string; reportPath: string; close: () => Promise<void> }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'generated-report-e2e-'));
  const reportRoot = path.join(root, 'reports');
  const paths = new ArtifactPaths(reportRoot, path.join(root, 'staging'));
  await paths.initialize();
  const runDirectory = await paths.allocateReport('service-a', BUILD_NUMBER, RUN_ID);
  const image = generatedReportImage();
  await Promise.all(SCREENSHOTS.map((filename) => fs.writeFile(path.join(runDirectory, filename), image, { mode: 0o600 })));
  const result = generatedReportResult();
  await writeProjectResult(runDirectory, result, generatedManifest(), reportRoot);
  const reportPath = `service-a/${BUILD_NUMBER}/${RUN_ID}/index.html`;
  const aggregate: AggregateReportResult = {
    schemaVersion: 2, generatedAt: OBSERVED_AT, warnings: [], projects: [{
      projectId: 'service-a', name: 'Service <A>', state: 'success', buildNumber: BUILD_NUMBER, runId: RUN_ID, reportPath,
      runs: [{ buildNumber: BUILD_NUMBER, runId: RUN_ID, state: 'success', manifestPath: `service-a/${BUILD_NUMBER}/${RUN_ID}/manifest.json`, reportPath, warnings: [] }], warnings: [],
    }],
  };
  await writeAggregateDataPair(reportRoot, aggregate);
  const server = await listen(root);
  return { ...server, reportPath: `/reports/${reportPath}` };
}
