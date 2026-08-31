import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

import { formatDiagnostic } from '../config-errors.js';
import { runFromTemplates } from './template-report-runner.js';

function terminalText(value: string, maximum = 512): string {
  return value.replace(/[\u0000-\u001f\u007f\u0080-\u009f]/gu, ' ').slice(0, maximum);
}

export async function main(
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const result = await runFromTemplates({
    ...env,
    ARTIFACT_DIR: env['ARTIFACT_DIR'] ?? 'reports',
    PROJECT_ID: env['PROJECT_ID'] ?? 'template-report',
    PROJECT_NAME: env['PROJECT_NAME'] ?? 'Template Synthetic Report',
    PLAYWRIGHT_HEADLESS: env['PLAYWRIGHT_HEADLESS'] ?? 'false',
    PLAYWRIGHT_SLOW_MO: env['PLAYWRIGHT_SLOW_MO'] ?? '500',
  });
  for (const outcome of result.outcomes) {
    const projectId = terminalText(outcome.projectId, 128);
    console.log(`${projectId}: ${terminalText(outcome.state, 32)}`);
    if (outcome.reportDirectory !== undefined) {
      console.log(`${projectId}: report ${terminalText(path.join(outcome.reportDirectory, 'index.html'))}`);
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
