import { parseConfig, type RunnerConfig } from '../../src/config.js';

export function phase3Config(): RunnerConfig {
  return parseConfig(process.env);
}

export function configWithoutBuildNumber(config: RunnerConfig): RunnerConfig {
  const copy = { ...config };
  delete copy.buildNumber;
  return copy;
}
