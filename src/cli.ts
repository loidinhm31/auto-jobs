import { formatDiagnostic } from './config-errors.js';
import { runFromEnvironment } from './runner.js';

try {
  const result = await runFromEnvironment();
  for (const outcome of result.outcomes) console.log(`${outcome.projectId}: ${outcome.state}`);
  for (const warning of result.warnings) console.warn(warning);
  process.exitCode = result.exitCode;
} catch (error) {
  console.error(formatDiagnostic(error));
  process.exitCode = 1;
}
