import { ConfigError } from '../config-errors.js';
import type { NormalizedProjectConfig } from './config-types.js';

export function selectReportProjects(
  projects: readonly NormalizedProjectConfig[],
): readonly NormalizedProjectConfig[] {
  const selected = projects.filter((project) => project.enabled && project.runType === 'report');
  if (selected.length === 0) {
    throw new ConfigError(['no enabled report projects found in configuration']);
  }
  return Object.freeze(selected);
}

export function selectAutoBuildProject(
  projects: readonly NormalizedProjectConfig[],
  projectId: string,
): NormalizedProjectConfig {
  if (typeof projectId !== 'string' || projectId.trim().length === 0) {
    throw new ConfigError(['projectId must be a non-empty string']);
  }
  const trimmedId = projectId.trim();
  const matching = projects.filter((project) => project.id === trimmedId);
  if (matching.length === 0) {
    throw new ConfigError([`project '${trimmedId}' was not found in configuration`]);
  }
  const project = matching[0]!;
  if (!project.enabled) {
    throw new ConfigError([`project '${trimmedId}' is disabled`]);
  }
  if (project.runType !== 'auto-build') {
    throw new ConfigError([`project '${trimmedId}' is not configured for auto-build`]);
  }
  return project;
}
