import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { expect, test, type Browser, type Page } from '@playwright/test';

import { parseProjectsConfig } from '../../src/config.js';
import { ArtifactPaths } from '../../src/artifacts/artifact-paths.js';
import { stagingLeasePath } from '../../src/artifacts/staging-lease.js';
import type { CaptureResult } from '../../src/project/project-runner.js';
import { runProject } from '../../src/project/project-runner.js';
import type { ProjectWorkflow } from '../../src/project/project-workflow.js';
import { runConfiguredProjects } from '../../src/runner.js';

function projectFile(root: string, firstBuildNumber: number | undefined = 11): string {
  const filePath = path.join(root, 'projects.json');
  fs.writeFileSync(filePath, JSON.stringify({
    schemaVersion: 1,
    defaults: { artifactDir: path.join(root, 'reports'), timeoutMs: 10_000, pollIntervalMs: 50 },
    projects: [
      { id: 'service-a', name: 'Service A', baseUrl: 'https://jenkins.example', jobPath: 'service-a',
        ...(firstBuildNumber === undefined ? {} : { buildNumber: firstBuildNumber }),
        credentials: { usernameVariable: 'A_USER', passwordVariable: 'A_PASSWORD' } },
      { id: 'service-b', name: 'Service B', baseUrl: 'https://jenkins.example', jobPath: 'service-b',
        buildNumber: 12, credentials: { usernameVariable: 'B_USER', passwordVariable: 'B_PASSWORD' } },
    ],
  }), { mode: 0o600 });
  return filePath;
}

test('keeps the pre-build staging lease until failure publication renames the directory', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-07-pre-build-lease-'));
  try {
    const environment = {
      PROJECTS_CONFIG_PATH: projectFile(root, undefined),
      A_USER: 'user-a', A_PASSWORD: 'secret-a',
      B_USER: 'user-b', B_PASSWORD: 'secret-b',
    };
    const project = parseProjectsConfig(environment).projects[0]!;
    const artifacts = new ArtifactPaths(path.join(root, 'reports'), path.join(root, 'artifacts'));
    await artifacts.initialize();
    const browser = {
      newContext: async () => ({ newPage: async () => ({}), close: async () => undefined }),
    } as unknown as Browser;

    const outcome = await runProject(project, {
      browser,
      artifacts,
      env: environment,
      now: () => new Date('2026-08-26T04:00:00.000Z'),
      runIdSuffix: () => '0000000000000001',
      workflow: async () => { throw new Error('trigger failed'); },
    });

    expect(outcome.state).toBe('failed');
    const stagingDirectory = path.join(artifacts.stagingRoot, project.id, outcome.runId);
    expect(outcome.reportDirectory).toBeUndefined();
    expect(fs.existsSync(stagingDirectory)).toBe(true);
    const lease = stagingLeasePath(artifacts.stagingRoot, project.id, outcome.runId);
    expect(fs.existsSync(lease)).toBe(true);

    const published = await artifacts.publishPreBuild(project.id, outcome.runId);
    expect(fs.existsSync(published.directory)).toBe(true);
    expect(fs.existsSync(published.manifestPath)).toBe(true);
    expect(fs.existsSync(stagingDirectory)).toBe(false);
    expect(fs.existsSync(lease)).toBe(false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('publishes sanitized pre-build trigger failures as discoverable runs and continues', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-08-pre-build-failure-'));
  try {
    const configPath = projectFile(root, undefined);
    const environment = {
      PROJECTS_CONFIG_PATH: configPath,
      A_USER: 'user-a', A_PASSWORD: 'secret-a',
      B_USER: 'user-b', B_PASSWORD: 'secret-b',
    };
    const projects = parseProjectsConfig(environment).projects;
    const browser = {
      newContext: async () => ({ newPage: async () => ({}), close: async () => undefined }),
      close: async () => undefined,
    } as unknown as Browser;
    const workflow: ProjectWorkflow = async (_page, project, _secrets, _deadline, state) => {
      state.transition('authenticated');
      state.transition('job_resolved');
      if (project.id === 'service-a') {
        state.transition('capability_checked');
        throw new Error('trigger failed password=secret-a');
      }
      state.transition('existing_build_selected');
      const build = { number: project.buildNumber as number, url: `${project.jobUrl}${project.buildNumber}/` };
      state.bindBuild(build);
      state.transition('running');
      state.transition('terminal');
      return {
        terminal: { build, status: 'SUCCESS', observedAt: '2026-08-24T04:00:00.000Z', observationErrors: [], reloadCount: 0 },
        trigger: { capability: 'existing_build', triggerAttempts: 0, build, warnings: [] },
      };
    };
    let suffix = 0;
    const result = await runConfiguredProjects(projects, {
      runtimeEnvironment: environment,
      launchBrowser: async () => browser,
      runIdSuffix: () => (++suffix).toString(16).padStart(16, '0'),
      now: () => new Date('2026-08-24T04:00:00.000Z'),
      executeProject: async (project, dependencies) => runProject(project, {
        ...dependencies,
        workflow,
        capture: async ({ workflow: completed }) => completeCapture(completed.terminal.build.url),
      }),
    });

    const failed = result.outcomes[0]!;
    expect(failed.state).toBe('failed');
    expect(failed.buildNumber).toBeUndefined();
    expect(failed.reportDirectory).toBe(path.join(root, 'reports', 'service-a', 'pre-build', failed.runId));
    expect(failed.manifestPath).toBe(path.join(failed.reportDirectory!, 'manifest.json'));
    expect(result.outcomes[1]?.state).toBe('success');
    expect(result.exitCode).toBe(1);

    const manifest = JSON.parse(fs.readFileSync(failed.manifestPath!, 'utf8')) as {
      state: string; jenkins?: unknown; diagnostic: string;
    };
    expect(manifest.state).toBe('failed');
    expect(manifest.jenkins).toBeUndefined();
    expect(manifest.diagnostic).not.toContain('secret-a');
    expect(result.manifests.some((item) => item.relativeDirectory === `service-a/pre-build/${failed.runId}`)).toBe(true);
    const aggregateProject = result.aggregate.projects.find((item) => item.projectId === 'service-a')!;
    expect(aggregateProject.runs).toContainEqual(expect.objectContaining({
      buildNumber: 'pre-build',
      runId: failed.runId,
      manifestPath: `service-a/pre-build/${failed.runId}/manifest.json`,
    }));
    expect(JSON.stringify(result.aggregate)).not.toContain('"buildNumber":0');
    expect(fs.existsSync(path.join(root, 'artifacts', 'service-a', failed.runId))).toBe(false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

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
    }, ['initial warning']);

    expect(order).toEqual(['service-a', 'service-b']);
    expect(pages).toHaveLength(2);
    expect(new Set(pages).size).toBe(2);
    expect(contextCloseCount).toBe(2);
    expect(browserCloseCount).toBe(1);
    expect(result.outcomes.map((item) => item.state)).toEqual(['failed', 'success']);
    expect(result.exitCode).toBe(1);
    expect(result.aggregate.projects.map((item) => item.projectId)).toEqual(['service-a', 'service-b']);
    expect(result.aggregate.warnings).toContain('initial warning');
    const failedManifestPath = result.outcomes[0]!.manifestPath;
    expect(failedManifestPath).toBeDefined();
    expect(fs.readFileSync(failedManifestPath as string, 'utf8')).not.toContain('secret-a');
    expect(fs.existsSync(path.join(root, 'reports', 'aggregate-data.json'))).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(root, 'reports', 'aggregate-data.json'), 'utf8')).warnings).toContain('initial warning');

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

test('keeps failure result and manifest timestamps identical after report rendering fails', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-06-failure-timestamp-'));
  try {
    const configPath = projectFile(root);
    const environment = {
      PROJECTS_CONFIG_PATH: configPath,
      A_USER: 'user-a', A_PASSWORD: 'secret-a',
      B_USER: 'user-b', B_PASSWORD: 'secret-b',
    };
    const project = parseProjectsConfig(environment).projects[0]!;
    const reportRoot = path.join(root, 'reports');
    const stagingRoot = path.join(root, 'artifacts');
    const blockedReportRoot = path.join(root, 'blocked-report-root');
    const artifacts = new ArtifactPaths(reportRoot, stagingRoot);
    await artifacts.initialize();
    fs.writeFileSync(blockedReportRoot, 'not a directory', { mode: 0o600 });
    const build = { number: project.buildNumber as number, url: `${project.jobUrl}${project.buildNumber}/` };
    const workflow: ProjectWorkflow = async (_page, _project, _secrets, _deadline, state) => {
      state.transition('authenticated'); state.transition('job_resolved');
      state.transition('existing_build_selected'); state.bindBuild(build); state.transition('running'); state.transition('terminal');
      return {
        terminal: { build, status: 'SUCCESS', observedAt: '2026-08-24T04:00:00.000Z', observationErrors: [], reloadCount: 0 },
        trigger: { capability: 'existing_build', triggerAttempts: 0, build, warnings: [] },
      };
    };
    const dates = [
      new Date('2026-08-24T04:00:00.000Z'),
      new Date('2026-08-24T04:00:00.001Z'),
      new Date('2026-08-24T04:00:00.002Z'),
    ];
    let nowIndex = 0;
    const browser = {
      newContext: async () => ({ newPage: async () => ({}), close: async () => undefined }),
    } as unknown as Browser;
    const outcome = await runProject(project, {
      browser,
      artifacts: {
        reportRoot: blockedReportRoot,
        allocateStaging: artifacts.allocateStaging.bind(artifacts),
        allocateReport: artifacts.allocateReport.bind(artifacts),
      } as unknown as ArtifactPaths,
      env: environment,
      now: () => dates[Math.min(nowIndex++, dates.length - 1)]!,
      runIdSuffix: () => '0000000000000001',
      workflow,
      capture: async ({ workflow: completed }) => completeCapture(completed.terminal.build.url),
    });

    expect(outcome.state).toBe('failed');
    const data = JSON.parse(fs.readFileSync(path.join(outcome.reportDirectory!, 'data.json'), 'utf8')) as { run: { observedAt: string } };
    const manifest = JSON.parse(fs.readFileSync(outcome.manifestPath!, 'utf8')) as { run: { observedAt: string } };
    expect(manifest.run.observedAt).toBe(data.run.observedAt);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
