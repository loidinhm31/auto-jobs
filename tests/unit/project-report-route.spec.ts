import { expect, test } from '@playwright/test';
import {
  isFinalProjectReportPath,
  parseProjectReportRoute,
  toCanonicalProjectReportPath,
} from '../../src/reporting/project-report-route.js';

test.describe('project-report-route parser', () => {
  test('matches valid explicit index.html report paths', () => {
    const match = parseProjectReportRoute('/reports/service-a/20260824t040000z-000000000001/index.html');
    expect(match).toEqual({
      projectId: 'service-a',
      runId: '20260824t040000z-000000000001',
      isIndexHtml: true,
      isDirectory: false,
      canonicalPath: '/reports/service-a/20260824t040000z-000000000001/index.html',
    });
    expect(isFinalProjectReportPath('/reports/service-a/20260824t040000z-000000000001/index.html')).toBe(true);
  });

  test('matches valid directory report paths', () => {
    const trailingSlash = parseProjectReportRoute('/reports/service-a/run-1/');
    expect(trailingSlash).toEqual({
      projectId: 'service-a',
      runId: 'run-1',
      isIndexHtml: false,
      isDirectory: true,
      canonicalPath: '/reports/service-a/run-1/index.html',
    });
    expect(isFinalProjectReportPath('/reports/service-a/run-1/')).toBe(false);

    const noTrailingSlash = parseProjectReportRoute('/reports/service-a/run-1');
    expect(noTrailingSlash).toEqual({
      projectId: 'service-a',
      runId: 'run-1',
      isIndexHtml: false,
      isDirectory: true,
      canonicalPath: '/reports/service-a/run-1/index.html',
    });
  });

  test('handles query parameters and hash fragments', () => {
    const match = parseProjectReportRoute('/reports/service-a/run-1/index.html?export=1#snyk-test-report');
    expect(match).toEqual({
      projectId: 'service-a',
      runId: 'run-1',
      isIndexHtml: true,
      isDirectory: false,
      canonicalPath: '/reports/service-a/run-1/index.html',
    });
  });

  test('rejects non-index sibling files in run directory', () => {
    expect(parseProjectReportRoute('/reports/service-a/run-1/data.json')).toBeUndefined();
    expect(parseProjectReportRoute('/reports/service-a/run-1/manifest.json')).toBeUndefined();
    expect(parseProjectReportRoute('/reports/service-a/run-1/snyk-test-report.png')).toBeUndefined();
    expect(parseProjectReportRoute('/reports/service-a/run-1/extra/index.html')).toBeUndefined();
  });

  test('rejects aggregate report and reserved directory names', () => {
    expect(parseProjectReportRoute('/reports/index.html')).toBeUndefined();
    expect(parseProjectReportRoute('/reports/assets/report.css')).toBeUndefined();
    expect(parseProjectReportRoute('/reports/assets/run-1/index.html')).toBeUndefined();
    expect(parseProjectReportRoute('/reports/service-a/assets/index.html')).toBeUndefined();
    expect(parseProjectReportRoute('/reports/api/run-1/index.html')).toBeUndefined();
  });

  test('rejects encoded path separators, null bytes, backslashes and double encoding', () => {
    expect(parseProjectReportRoute('/reports/service%2fa/run-1/index.html')).toBeUndefined();
    expect(parseProjectReportRoute('/reports/service%2Fa/run-1/index.html')).toBeUndefined();
    expect(parseProjectReportRoute('/reports/service-a/run%5c1/index.html')).toBeUndefined();
    expect(parseProjectReportRoute('/reports/service-a/run%5C1/index.html')).toBeUndefined();
    expect(parseProjectReportRoute('/reports/service-a/run%001/index.html')).toBeUndefined();
    expect(parseProjectReportRoute('/reports/service%252fa/run-1/index.html')).toBeUndefined();
    expect(parseProjectReportRoute('/reports/service-a\\run-1/index.html')).toBeUndefined();
    expect(parseProjectReportRoute('/reports/service-a/run-1\0/index.html')).toBeUndefined();
  });

  test('rejects directory traversal and hidden dot segments', () => {
    expect(parseProjectReportRoute('/reports/../secret/index.html')).toBeUndefined();
    expect(parseProjectReportRoute('/reports/service-a/../index.html')).toBeUndefined();
    expect(parseProjectReportRoute('/reports/service-a/..')).toBeUndefined();
    expect(parseProjectReportRoute('/reports/.hidden/run-1/index.html')).toBeUndefined();
    expect(parseProjectReportRoute('/reports/service-a/.hidden/index.html')).toBeUndefined();
  });

  test('rejects non-SAFE_ID characters', () => {
    expect(parseProjectReportRoute('/reports/UPPERCASE/run-1/index.html')).toBeUndefined();
    expect(parseProjectReportRoute('/reports/service-a/RUN_WITH_CAPS/index.html')).toBeUndefined();
    expect(parseProjectReportRoute('/reports/service space/run-1/index.html')).toBeUndefined();
    expect(parseProjectReportRoute('/reports/service@bad/run-1/index.html')).toBeUndefined();
    expect(parseProjectReportRoute('/reports//run-1/index.html')).toBeUndefined();
    expect(parseProjectReportRoute('//reports/service-a/run-1/index.html')).toBeUndefined();
    expect(parseProjectReportRoute('')).toBeUndefined();
  });

  test('toCanonicalProjectReportPath builds exact canonical path', () => {
    expect(toCanonicalProjectReportPath('service-a', 'run-1')).toBe('/reports/service-a/run-1/index.html');
  });
});
