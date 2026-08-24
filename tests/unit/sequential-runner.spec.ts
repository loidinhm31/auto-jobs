import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { expect, test, type Browser, type Page } from '@playwright/test';

import { parseProjectsConfig } from '../../src/config.js';
import type { CaptureResult } from '../../src/project/project-runner.js';
import type { ProjectWorkflow } from '../../src/project/project-workflow.js';
import { runConfiguredProjects } from '../../src/runner.js';

function projectFile(root: string): string {
  const filePath = path.join(root, 'projects.json');
  fs.writeFileSync(filePath, JSON.stringify({
    schemaVersion: 1,
    defaults: { artifactDir: path.join(root, 'reports'), timeoutMs: 10_000, pollIntervalMs: 50 },
    projects: [
      { id: 'service-a', name: 'Service A', baseUrl: 'https://jenkins.example', jobPath: 'service-a',
        buildNumber: 11, credentials: { usernameVariable: 'A_USER', passwordVariable: 'A_PASSWORD' } },
      { id: 'service-b', name: 'Service B', baseUrl: 'https://jenkins.example', jobPath: 'service-b',
        buildNumber: 12, credentials: { usernameVariable: 'B_USER', passwordVariable: 'B_PASSWORD' } },
    ],
  }), { mode: 0o600 });
  return filePath;
}

function completeCapture(buildUrl: string): CaptureResult {
  const found = { state: 'found' as const, captures: [], navigation: [], warnings: [] };
  return {
    navigation: {
      'jenkins-build': { key: 'jenkins-build', localAnchor: '#jenkins', state: 'found', liveUrl: buildUrl },
      'snyk-report': { key: 'snyk-report', localAnchor: '#snyk', state: 'found' },
      'sonarqube-home': { key: 'sonarqube-home', localAnchor: '#sonar', state: 'found' },
      'sonarqube-overall': { key: 'sonarqube-overall', localAnchor: '#overall', state: 'found' },
      'sonarqube-issues': { key: 'sonarqube-issues', localAnchor: '#issues', state: 'found' },
    },
    reports: { snyk: found, sonarqube: found }, warnings: [],
  };
}

test('defers file-mode secret lookup until each project becomes active', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-03-secrets-'));
  try {
    const result = parseProjectsConfig({ PROJECTS_CONFIG_PATH: projectFile(root) });
    expect(result.projects.map((project) => project.id)).toEqual(['service-a', 'service-b']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('runs in config order with fresh contexts, continues failures, and closes once', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-03-runner-'));
  try {
    const configPath = projectFile(root);
    const environment = {
      PROJECTS_CONFIG_PATH: configPath,
      A_USER: 'user-a', A_PASSWORD: 'secret-a',
      B_USER: 'user-b', B_PASSWORD: 'secret-b',
    };
    const projects = parseProjectsConfig(environment).projects;
    const pages: object[] = [];
    let contextCloseCount = 0;
    let browserCloseCount = 0;
    const browser = {
      newContext: async () => {
        const page = {};
        pages.push(page);
        return { newPage: async () => page, close: async () => { contextCloseCount += 1; } };
      },
      close: async () => { browserCloseCount += 1; },
    } as unknown as Browser;
    const order: string[] = [];
    const workflow: ProjectWorkflow = async (_page, project, secrets, _deadline, state) => {
      order.push(project.id);
      state.transition('authenticated');
      if (project.id === 'service-a') throw new Error(`login failed ${secrets.password}`);
      state.transition('job_resolved'); state.transition('existing_build_selected');
      const build = { number: project.buildNumber as number, url: `${project.jobUrl}${project.buildNumber}/` };
      state.bindBuild(build); state.transition('running'); state.transition('terminal');
      return { terminal: { build, status: 'SUCCESS', observedAt: '2026-08-24T04:00:00.000Z', observationErrors: [], reloadCount: 0 },
        trigger: { capability: 'existing_build', triggerAttempts: 0, build, warnings: [] } };
    };
    let suffix = 0;
    const result = await runConfiguredProjects(projects, {
      runtimeEnvironment: environment,
      launchBrowser: async () => browser,
      runIdSuffix: () => (++suffix).toString(16).padStart(16, '0'),
      now: () => new Date('2026-08-24T04:00:00.000Z'),
      executeProject: async (project, dependencies) => {
        const { runProject } = await import('../../src/project/project-runner.js');
        return runProject(project, { ...dependencies, workflow,
          capture: async ({ workflow: completed }) => completeCapture(completed.terminal.build.url) });
      },
    });

    expect(order).toEqual(['service-a', 'service-b']);
    expect(pages).toHaveLength(2);
    expect(new Set(pages).size).toBe(2);
    expect(contextCloseCount).toBe(2);
    expect(browserCloseCount).toBe(1);
    expect(result.outcomes.map((item) => item.state)).toEqual(['failed', 'success']);
    expect(result.exitCode).toBe(1);
    expect(result.aggregate.projects.map((item) => item.projectId)).toEqual(['service-a', 'service-b']);
    const failedManifestPath = result.outcomes[0]!.manifestPath;
    expect(failedManifestPath).toBeDefined();
    expect(fs.readFileSync(failedManifestPath as string, 'utf8')).not.toContain('secret-a');
    expect(fs.existsSync(path.join(root, 'reports', 'aggregate-data.json'))).toBe(true);

    const rerun = await runConfiguredProjects(projects, {
      runtimeEnvironment: environment,
      launchBrowser: async () => browser,
      runIdSuffix: () => (++suffix).toString(16).padStart(16, '0'),
      now: () => new Date('2026-08-24T04:00:00.000Z'),
      executeProject: async (project, dependencies) => {
        const { runProject } = await import('../../src/project/project-runner.js');
        return runProject(project, { ...dependencies, workflow,
          capture: async ({ workflow: completed }) => completeCapture(completed.terminal.build.url) });
      },
    });
    expect(rerun.aggregate.projects[1]?.runs).toHaveLength(2);
    expect(new Set(rerun.aggregate.projects[1]?.runs.map((run) => run.runId)).size).toBe(2);
    expect(contextCloseCount).toBe(4);
    expect(browserCloseCount).toBe(2);

    const thrownProject = await runConfiguredProjects(projects, {
      launchBrowser: async () => browser,
      executeProject: async (project) => {
        if (project.id === 'service-a') throw new Error('allocation failed');
        return { projectId: project.id, name: project.name, state: 'success', runId: 'synthetic', warnings: [] };
      },
    });
    expect(thrownProject.outcomes.map((item) => item.projectId)).toEqual(['service-a', 'service-b']);
    expect(thrownProject.outcomes[0]?.state).toBe('failed');
    expect(thrownProject.outcomes[1]?.state).toBe('success');
    expect(thrownProject.exitCode).toBe(1);
    expect(browserCloseCount).toBe(3);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
