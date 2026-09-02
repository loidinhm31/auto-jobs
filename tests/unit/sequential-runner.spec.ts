import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { expect, test, type Browser } from '@playwright/test';

import { loadProjectConfig } from '../../src/config.js';
import type { AggregateReportResult } from '../../src/result-types.js';
import { ArtifactPaths } from '../../src/artifacts/artifact-paths.js';
import type { CaptureResult } from '../../src/project/project-runner.js';
import { runProject } from '../../src/project/project-runner.js';
import type { ProjectWorkflow } from '../../src/project/project-workflow.js';
import { WorkflowDeadline, withWorkflowDeadlineAndLateResource } from '../../src/workflow/workflow-deadline.js';
import { launchOptions, runConfiguredProjects, runFromConfig } from '../../src/runner.js';

function projectFile(root: string): string {
  const filePath = path.join(root, 'projects.json');
  fs.writeFileSync(filePath, JSON.stringify({
    schemaVersion: 1,
    defaults: { artifactDir: path.join(root, 'reports'), timeoutMs: 10_000 },
    projects: [
      { id: 'service-a', name: 'Service A', loginUrl: 'https://jenkins.example/login', jobUrl: 'https://jenkins.example/job/service-a/', credentials: { usernameVariable: 'A_USER', passwordVariable: 'A_PASSWORD' } },
      { id: 'service-b', name: 'Service B', loginUrl: 'https://jenkins.example/login', jobUrl: 'https://jenkins.example/job/service-b/', credentials: { usernameVariable: 'B_USER', passwordVariable: 'B_PASSWORD' } },
    ],
  }), { mode: 0o600 });
  return filePath;
}

function completeCapture(jobUrl: string): CaptureResult {
  const target = (key: 'jenkins-job' | 'snyk-report' | 'sonarqube-home' | 'sonarqube-overall' | 'sonarqube-issues') => ({
    key, localAnchor: `#${key}`, state: 'found' as const,
  });
  const source = { state: 'found' as const, captures: [], navigation: [], warnings: [] };
  const snykSource = { ...source, navigation: [target('snyk-report')] };
  const sonarqubeSource = {
    ...source,
    navigation: [target('sonarqube-home'), target('sonarqube-overall'), target('sonarqube-issues')],
  };
  return {
    navigation: {
      'jenkins-job': { ...target('jenkins-job'), localAnchor: '#jenkins', liveUrl: jobUrl },
      'snyk-report': target('snyk-report'),
      'sonarqube-home': target('sonarqube-home'),
      'sonarqube-overall': target('sonarqube-overall'),
      'sonarqube-issues': target('sonarqube-issues'),
    },
    reports: { snyk: snykSource, sonarqube: sonarqubeSource }, warnings: [],
  };
}

function fakeBrowser(): Browser {
  return {
    newContext: async () => ({ newPage: async () => ({}), close: async () => undefined }),
    close: async () => undefined,
  } as unknown as Browser;
}

class DelayedReportAllocationPaths extends ArtifactPaths {
  public override async allocateReport(
    projectId: string,
    runId: string,
    deadline?: WorkflowDeadline,
  ): Promise<string> {
    const directory = await super.allocateReport(projectId, runId, deadline);
    await new Promise<void>((resolve) => setTimeout(resolve, 1_100));
    return directory;
  }
}

test('closes a resource that resolves after the workflow deadline', async () => {
  test.setTimeout(5_000);
  let closed = false;
  const resource = { close: async () => { closed = true; } };
  await expect(withWorkflowDeadlineAndLateResource(
    async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 100));
      return resource;
    },
    new WorkflowDeadline(20),
    async (lateResource) => { await lateResource.close(); },
  )).rejects.toThrow(/deadline/iu);
  await new Promise<void>((resolve) => setTimeout(resolve, 150));
  expect(closed).toBe(true);
});

test('publishes a direct failed run in its allocated report directory', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'direct-failure-publication-'));
  try {
    const environment = { A_USER: 'user-a', A_PASSWORD: 'secret-a', B_USER: 'user-b', B_PASSWORD: 'secret-b' };
    const project = loadProjectConfig(projectFile(root), environment)[0]!;
    const artifactsRoot = path.join(root, 'reports');
    const artifacts = new ArtifactPaths(artifactsRoot, path.join(root, 'staging'));
    await artifacts.initialize();
    const outcome = await runProject(project, {
      browser: fakeBrowser(), artifacts, env: environment,
      now: () => new Date('2026-08-24T04:00:00.000Z'), runIdSuffix: () => '0000000000000001',
      workflow: async () => { throw new Error('login failed password=secret-a'); },
    });
    expect(outcome.state).toBe('failed');
    expect(outcome.reportDirectory).toBe(path.join(artifactsRoot, project.id, outcome.runId));
    expect(fs.existsSync(outcome.reportDirectory!)).toBe(true);
    const data = JSON.parse(fs.readFileSync(path.join(outcome.reportDirectory!, 'data.json'), 'utf8')) as { schemaVersion: number; diagnostic: string };
    expect(data.schemaVersion).toBe(3);
    expect(data.diagnostic).not.toContain('secret-a');
    expect(fs.existsSync(path.join(root, 'staging', project.id, outcome.runId))).toBe(false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test('persists an allocated failure artifact after the workflow deadline expires', async () => {
  test.setTimeout(10_000);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'direct-deadline-failure-'));
  try {
    const environment = { A_USER: 'user-a', A_PASSWORD: 'secret-a', B_USER: 'user-b', B_PASSWORD: 'secret-b' };
    const configured = loadProjectConfig(projectFile(root), environment)[0]!;
    const project = { ...configured, timeoutMs: 1_000 };
    const artifactsRoot = path.join(root, 'reports');
    const artifacts = new ArtifactPaths(artifactsRoot, path.join(root, 'staging'));
    await artifacts.initialize();
    const outcome = await runProject(project, {
      browser: fakeBrowser(),
      artifacts,
      env: environment,
      now: () => new Date('2026-08-24T04:00:00.000Z'),
      runIdSuffix: () => '0000000000000002',
      workflow: async () => {
        await new Promise<void>((resolve) => setTimeout(resolve, 1_100));
        throw new Error('workflow deadline fixture');
      },
    });
    expect(outcome.state).toBe('failed');
    expect(outcome.runId).not.toBe('unallocated');
    expect(outcome.reportDirectory).toBe(path.join(artifactsRoot, project.id, outcome.runId));
    expect(outcome.manifestPath).toBeDefined();
    expect(fs.existsSync(path.join(outcome.reportDirectory!, 'manifest.json'))).toBe(true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('keeps the allocated run identity when the deadline expires after report allocation', async () => {
  test.setTimeout(10_000);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'direct-allocation-deadline-'));
  try {
    const environment = { A_USER: 'user-a', A_PASSWORD: 'secret-a', B_USER: 'user-b', B_PASSWORD: 'secret-b' };
    const configured = loadProjectConfig(projectFile(root), environment)[0]!;
    const project = { ...configured, timeoutMs: 1_000 };
    const artifactsRoot = path.join(root, 'reports');
    const artifacts = new DelayedReportAllocationPaths(artifactsRoot, path.join(root, 'staging'));
    await artifacts.initialize();
    const outcome = await runProject(project, {
      browser: fakeBrowser(),
      artifacts,
      env: environment,
      now: () => new Date('2026-08-24T04:00:00.000Z'),
      runIdSuffix: () => '0000000000000003',
    });
    expect(outcome.state).toBe('failed');
    expect(outcome.runId).not.toBe('unallocated');
    expect(outcome.reportDirectory).toBe(path.join(artifactsRoot, project.id, outcome.runId));
    expect(outcome.manifestPath).toBeDefined();
    expect(fs.existsSync(path.join(outcome.reportDirectory!, 'manifest.json'))).toBe(true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});


test('runs projects in config order, isolates contexts, and continues after failure', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'direct-sequential-runner-'));
  try {
    const environment = { A_USER: 'user-a', A_PASSWORD: 'secret-a', B_USER: 'user-b', B_PASSWORD: 'secret-b' };
    const projects = loadProjectConfig(projectFile(root), environment);
    const browser = fakeBrowser();
    const order: string[] = [];
    const workflow: ProjectWorkflow = async (_page, project, _secrets, _deadline, state) => {
      order.push(project.id);
      state.transition('authenticated');
      if (project.id === 'service-a') throw new Error('first project failed');
      state.transition('job_opened');
      return { jobUrl: project.jobUrl, observedAt: '2026-08-24T04:00:00.000Z' };
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
        capture: async () => completeCapture(project.jobUrl),
      }),
    }, ['initial warning']);
    expect(order).toEqual(['service-a', 'service-b']);
    expect(result.outcomes.map((item) => item.state)).toEqual(['failed', 'success']);
    expect(result.exitCode).toBe(1);
    expect(result.aggregate.warnings).toContain('initial warning');
    expect(JSON.stringify(result.aggregate)).not.toContain('buildNumber');
    const success = result.outcomes[1]!;
    expect(fs.existsSync(path.join(success.reportDirectory!, 'data.json'))).toBe(true);
    expect(result.aggregate.projects[1]?.runs).toContainEqual(expect.objectContaining({
      runId: success.runId,
      manifestPath: `service-b/${success.runId}/manifest.json`,
      reportPath: `service-b/${success.runId}/index.html`,
    }));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test('omits overlong history labels without rejecting aggregate publication', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aggregate-display-bound-'));
  try {
    const environment = { A_USER: 'user-a', A_PASSWORD: 'secret-a' };
    const configured = loadProjectConfig(projectFile(root), environment)[0]!;
    const longJobId = 'x'.repeat(257);
    const project = {
      ...configured,
      jobUrl: `https://jenkins.example/job/folder/job/folder-name/job/${longJobId}/job/release%252Fsit/`,
    };
    const result = await runConfiguredProjects([project], {
      runtimeEnvironment: environment,
      launchBrowser: async () => fakeBrowser(),
      runIdSuffix: () => '0000000000000005',
      now: () => new Date('2026-08-24T04:00:00.000Z'),
      executeProject: async (currentProject, dependencies) => runProject(currentProject, {
        ...dependencies,
        workflow: async (_page, workflowProject, _secrets, _deadline, state) => {
          state.transition('authenticated');
          state.transition('job_opened');
          return { jobUrl: workflowProject.jobUrl, observedAt: '2026-08-24T04:00:00.000Z' };
        },
        capture: async () => completeCapture(currentProject.jobUrl),
      }),
    });
    const run = result.aggregate.projects[0]?.runs[0];
    expect(result.exitCode).toBe(0);
    expect(run).toMatchObject({ branch: 'release/sit' });
    expect(run).not.toHaveProperty('jobId');
    expect(fs.existsSync(path.join(root, 'reports', 'aggregate-data.json'))).toBe(true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('bounds failure diagnostics before aggregate publication', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aggregate-failure-diagnostics-'));
  const environment = { A_USER: 'user-a', A_PASSWORD: 'secret-a', B_USER: 'user-b', B_PASSWORD: 'secret-b' };
  const longDiagnostic = `password=secret-a ${'diagnostic '.repeat(500)}`;
  try {
    const projects = loadProjectConfig(projectFile(root), environment);
    const result = await runConfiguredProjects(projects.slice(0, 1), {
      runtimeEnvironment: environment,
      launchBrowser: async () => fakeBrowser(),
      now: () => new Date('2026-08-24T04:00:00.000Z'),
      executeProject: async (project) => ({
        projectId: project.id,
        name: project.name,
        state: 'failed' as const,
        runId: 'run-1',
        warnings: [longDiagnostic],
        error: longDiagnostic,
      }),
    }, [longDiagnostic]);
    const persisted = JSON.parse(fs.readFileSync(path.join(root, 'reports', 'aggregate-data.json'), 'utf8')) as AggregateReportResult;
    expect(result.aggregate.projects[0]?.warnings.every((warning) => warning.length <= 500)).toBe(true);
    expect(result.aggregate.warnings.every((warning) => warning.length <= 500)).toBe(true);
    expect(persisted.projects[0]?.warnings.every((warning) => warning.length <= 500)).toBe(true);
    expect(JSON.stringify(persisted)).not.toContain('secret-a');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('configures launchOptions with executablePath, headless, and slowMo action delay', () => {
  expect(launchOptions({})).toEqual({});
  expect(launchOptions({ PLAYWRIGHT_EXECUTABLE_PATH: '  C:\\bin\\chrome.exe  ' })).toEqual({
    executablePath: 'C:\\bin\\chrome.exe',
  });
  expect(launchOptions({ PLAYWRIGHT_HEADLESS: 'true' })).toEqual({ headless: true });
  expect(launchOptions({ PLAYWRIGHT_HEADLESS: 'false' })).toEqual({ headless: false });
  expect(launchOptions({ PLAYWRIGHT_HEADED: '1' })).toEqual({ headless: false });
  expect(launchOptions({ HEADED: 'true' })).toEqual({ headless: false });
  expect(launchOptions({ PLAYWRIGHT_SLOW_MO: '250' })).toEqual({ slowMo: 250 });
  expect(launchOptions({ PLAYWRIGHT_ACTION_DELAY: '500' })).toEqual({ slowMo: 500 });
  expect(launchOptions({ PLAYWRIGHT_SLOW_MO: '100', PLAYWRIGHT_ACTION_DELAY: '500' })).toEqual({ slowMo: 100 });
  expect(() => launchOptions({ PLAYWRIGHT_SLOW_MO: '-5' })).toThrow(/non-negative/iu);
  expect(() => launchOptions({ PLAYWRIGHT_SLOW_MO: 'abc' })).toThrow(/non-negative/iu);
  expect(() => launchOptions({ PLAYWRIGHT_SLOW_MO: '12.5' })).toThrow(/non-negative/iu);
  expect(() => launchOptions({ PLAYWRIGHT_HEADLESS: 'invalid' })).toThrow(/true or false/iu);
});

test('runFromConfig executes report projects only and excludes auto-build projects', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'auto-jobs-report-select-'));
  const environment = {
    A_USER: 'user-a',
    A_PASSWORD: 'secret-password-a',
    B_USER: 'user-b',
    B_PASSWORD: 'secret-password-b',
  };
  const executedProjectIds: string[] = [];
  try {
    const filePath = path.join(root, 'projects.json');
    fs.writeFileSync(filePath, JSON.stringify({
      schemaVersion: 1,
      defaults: { artifactDir: path.join(root, 'reports'), timeoutMs: 10_000 },
      projects: [
        { id: 'report-proj', name: 'Report Proj', runType: 'report', loginUrl: 'https://jenkins.example/login', jobUrl: 'https://jenkins.example/job/report-proj/', credentials: { usernameVariable: 'A_USER', passwordVariable: 'A_PASSWORD' } },
        { id: 'build-proj', name: 'Build Proj', runType: 'auto-build', loginUrl: 'https://jenkins.example/login', jobUrl: 'https://jenkins.example/job/build-proj/', credentials: { usernameVariable: 'B_USER', passwordVariable: 'B_PASSWORD' } },
      ],
    }), { mode: 0o600 });

    const result = await runFromConfig(filePath, environment, {
      launchBrowser: async () => fakeBrowser(),
      executeProject: async (project) => {
        executedProjectIds.push(project.id);
        return {
          projectId: project.id,
          name: project.name,
          state: 'success',
          runId: 'run-1',
          warnings: [],
        };
      },
    });

    expect(executedProjectIds).toEqual(['report-proj']);
    expect(result.outcomes.map((o) => o.projectId)).toEqual(['report-proj']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
