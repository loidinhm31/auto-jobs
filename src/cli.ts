import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

import { ConfigError, formatDiagnostic } from './config-errors.js';
import { runFromConfig } from './runner.js';

export interface ReportArguments {
  readonly configPath: string;
}

export function parseReportArguments(args: readonly string[] = process.argv.slice(2)): ReportArguments {
  const issues: string[] = [];
  let configPath: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === undefined) continue;
    if (argument === '--config') {
      if (configPath !== undefined) issues.push('duplicate --config option');
      const candidate = args[index + 1];
      if (candidate === undefined || candidate.length === 0 || candidate.startsWith('--')) {
        issues.push('--config requires a path');
        continue;
      }
      configPath = candidate;
      index += 1;
      continue;
    }
    if (argument.startsWith('--')) issues.push(`unknown option ${argument}`);
    else issues.push(`unexpected positional argument ${argument}`);
  }
  if (configPath === undefined) issues.push('--config <path> is required');
  if (issues.length > 0) throw new ConfigError(issues);
  return { configPath: configPath as string };
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

export async function main(
  args: readonly string[] = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const { configPath } = parseReportArguments(args);
  const result = await runFromConfig(configPath, env);
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
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } catch (error) {
    console.error(terminalText(formatDiagnostic(error)));
    process.exitCode = 1;
  }
}
