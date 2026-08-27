import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { formatDiagnostic } from './config-errors.js';
import { runFromEnvironment } from './runner.js';
import { runFromTemplates } from './templates/template-report-runner.js';

function reportSource(): 'templates' | 'jenkins' {
  const source = process.env['REPORT_SOURCE']?.trim() || 'templates';
  if (source === 'templates' || source === 'jenkins') return source;
  throw new Error('REPORT_SOURCE must be templates or jenkins');
}

function terminalText(value: string, maximum = 512): string {
  return value.replace(/[\u0000-\u001f\u007f\u0080-\u009f]/gu, ' ').slice(0, maximum);
}

interface ReportSummaryData {
  reports?: {
    snyk?: {
      summary?: {
        counts?: Record<string, number>;
        detail?: { retainedCount?: number; totalObserved?: number };
      };
      captures?: { screenshotPath?: string }[];
    };
    sonarqube?: {
      facets?: {
        types?: { label: string; count: number }[];
        severities?: { label: string; count: number }[];
      };
      captures?: { screenshotPath?: string }[];
    };
  };
}

function facetSummary(values: readonly { label: string; count: number }[] | undefined): string | undefined {
  if (values === undefined || values.length === 0) return undefined;
  return values.map((value) => `${terminalText(value.label, 128)}=${value.count}`).join(', ');
}

async function reportSummary(reportDirectory: string): Promise<string | undefined> {
  try {
    const data = JSON.parse(await fs.readFile(path.join(reportDirectory, 'data.json'), 'utf8')) as ReportSummaryData;
    const snyk = data.reports?.snyk;
    const sonarqube = data.reports?.sonarqube;
    const parts: string[] = [];
    if (snyk?.summary?.counts !== undefined) {
      const counts = snyk.summary.counts;
      const severityCounts = ['critical', 'high', 'medium', 'low']
        .filter((severity) => typeof counts[severity] === 'number')
        .map((severity) => `${severity}=${counts[severity]}`)
        .join(', ');
      if (severityCounts.length > 0) parts.push(`Snyk ${severityCounts}`);
      const detail = snyk.summary.detail;
      if (detail?.retainedCount !== undefined && detail.totalObserved !== undefined) {
        parts.push(`detailed=${detail.retainedCount}/${detail.totalObserved}`);
      }
    }
    const types = facetSummary(sonarqube?.facets?.types);
    const severities = facetSummary(sonarqube?.facets?.severities);
    if (types !== undefined) parts.push(`SonarQube types ${types}`);
    if (severities !== undefined) parts.push(`severities ${severities}`);
    const screenshotCount = [...(snyk?.captures ?? []), ...(sonarqube?.captures ?? [])]
      .filter((capture) => typeof capture.screenshotPath === 'string').length;
    if (screenshotCount > 0) parts.push(`snapshots=${screenshotCount}`);
    return parts.length === 0 ? undefined : parts.join('; ');
  } catch {
    return undefined;
  }
}

try {
  const source = reportSource();
  const result = source === 'templates' ? await runFromTemplates() : await runFromEnvironment();
  if (source === 'templates') console.log('report source: checked-in templates (no Jenkins job was run)');
  for (const outcome of result.outcomes) {
    const projectId = terminalText(outcome.projectId, 128);
    console.log(`${projectId}: ${terminalText(outcome.state, 32)}`);
    if (outcome.reportDirectory !== undefined) console.log(`${projectId}: report ${terminalText(path.join(outcome.reportDirectory, 'index.html'))}`);
    if (outcome.reportDirectory !== undefined) {
      const summary = await reportSummary(outcome.reportDirectory);
      if (summary !== undefined) console.log(`${projectId}: summary ${terminalText(summary)}`);
    }
    for (const warning of outcome.warnings) console.warn(`${projectId}: ${terminalText(warning)}`);
    if (outcome.error !== undefined) console.warn(`${projectId}: ${terminalText(outcome.error)}`);
  }
  for (const warning of result.warnings) console.warn(terminalText(warning));
  console.log(`aggregate report: ${terminalText(path.join(result.reportRoot, 'index.html'))}`);
  process.exitCode = result.exitCode;
} catch (error) {
  console.error(terminalText(formatDiagnostic(error)));
  process.exitCode = 1;
}
