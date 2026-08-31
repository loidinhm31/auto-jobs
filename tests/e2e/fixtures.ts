import * as path from 'node:path';

import {
  loadProjectConfig,
  resolveProjectSecrets,
} from '../../src/config.js';
import { deriveJenkinsBaseUrl } from '../../src/config-values.js';
import {
  DEFAULT_JENKINS_RUNNER_SELECTORS,
  type JenkinsRunnerConfig,
} from '../../src/jenkins/runner-config.js';
export function phase3Config(
  filePath = path.resolve('config/projects.example.json'),
): JenkinsRunnerConfig {
  const project = loadProjectConfig(filePath, {}, false)[0];
  if (project === undefined) throw new Error('the explicit report config must contain a project');
  const secrets = resolveProjectSecrets(project, process.env);
  return {
    baseUrl: deriveJenkinsBaseUrl(project.loginUrl, project.jobUrl),
    loginUrl: project.loginUrl,
    jobUrl: project.jobUrl,
    username: secrets.username,
    password: secrets.password,
    timeoutMs: project.timeoutMs,
    pollIntervalMs: 1_000,
    browser: project.browser,
    artifactDir: project.artifactDir,
    selectors: {
      ...DEFAULT_JENKINS_RUNNER_SELECTORS,
      ...project.selectors,
    },
  };
}

export function configWithoutBuildNumber(config: JenkinsRunnerConfig): JenkinsRunnerConfig {
  const copy = { ...config };
  delete copy.buildNumber;
  return copy;
}
