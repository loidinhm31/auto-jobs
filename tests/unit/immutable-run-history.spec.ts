import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { expect, test, type Browser } from '@playwright/test';

import { parseProjectsConfig } from '../../src/config.js';
import type { CaptureResult } from '../../src/project/project-runner.js';
import { runProject } from '../../src/project/project-runner.js';
import type { ProjectWorkflow } from '../../src/project/project-workflow.js';
import { runConfiguredProjects } from '../../src/runner.js';

function writeConfig(root: string): string {
  const filename = path.join(root, 'projects.json');
  fs.writeFileSync(filename, JSON.stringify({
    schemaVersion: 1,
    defaults: { artifactDir: path.join(root, 'reports'), timeoutMs: 10_000, pollIntervalMs: 50 },
    projects: [{
      id: 'service-a', name: 'Service A', baseUrl: 'https://jenkins.example', jobPath: 'service-a',
      buildNumber: 42, credentials: { usernameVariable: 'USER', passwordVariable: 'PASSWORD' },
    }],
  }), { mode: 0o600 });
  return filename;
}

function completeCapture(buildUrl: string): CaptureResult {
  const source = { state: 'found' as const, captures: [], navigation: [], warnings: [] };
  const target = (key: 'jenkins-build' | 'snyk-report' | 'sonarqube-home' | 'sonarqube-overall' | 'sonarqube-issues') => ({
    key, localAnchor: `#${key}`, state: 'found' as const,
  });
  return {
    navigation: {
      'jenkins-build': { ...target('jenkins-build'), liveUrl: buildUrl },
      'snyk-report': target('snyk-report'),
      'sonarqube-home': target('sonarqube-home'),
      'sonarqube-overall': target('sonarqube-overall'),
      'sonarqube-issues': target('sonarqube-issues'),
    },
    reports: { snyk: source, sonarqube: source },
    warnings: [],
  };
}

test('keeps exact same-build reruns in immutable report folders and aggregate links', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-07-run-history-'));
  try {
    const environment = {
      PROJECTS_CONFIG_PATH: writeConfig(root), USER: 'fixture-user', PASSWORD: 'fixture-password',
    };
    const project = parseProjectsConfig(environment).projects[0]!;
    const browser = {
      newContext: async () => ({ newPage: async () => ({}), close: async () => undefined }),
      close: async () => undefined,
    } as unknown as Browser;
    const workflow: ProjectWorkflow = async (_page, currentProject, _secrets, _deadline, state) => {
      const build = { number: currentProject.buildNumber as number, url: `${currentProject.jobUrl}${currentProject.buildNumber}/` };
      state.transition('authenticated');
      state.transition('job_resolved');
      state.transition('existing_build_selected');
      state.bindBuild(build);
      state.transition('running');
      state.transition('terminal');
      return {
        terminal: { build, status: 'SUCCESS', observedAt: '2026-08-24T04:00:00.000Z', observationErrors: [], reloadCount: 0 },
        trigger: { capability: 'existing_build', triggerAttempts: 0, build, warnings: [] },
      };
    };
    let suffix = 0;
    const executeProject = (currentProject: typeof project, dependencies: Parameters<typeof runProject>[1]) => runProject(currentProject, {
      ...dependencies,
      workflow,
      capture: async ({ workflow: completed }) => completeCapture(completed.terminal.build.url),
    });
    const run = () => runConfiguredProjects([project], {
      runtimeEnvironment: environment,
      launchBrowser: async () => browser,
      runIdSuffix: () => (++suffix).toString(16).padStart(16, '0'),
      now: () => new Date('2026-08-24T04:00:00.000Z'),
      executeProject,
    });

    const first = await run();
    const firstOutcome = first.outcomes[0]!;
    const firstDirectory = firstOutcome.reportDirectory!;
    const snapshot = ['data.json', 'index.html', 'manifest.json'].map((filename) => ({
      filename, contents: fs.readFileSync(path.join(firstDirectory, filename)),
    }));

    const second = await run();
    const secondOutcome = second.outcomes[0]!;
    expect(firstOutcome.buildNumber).toBe(42);
    expect(secondOutcome.buildNumber).toBe(42);
    expect(secondOutcome.reportDirectory).not.toBe(firstDirectory);
    for (const file of snapshot) {
      expect(fs.readFileSync(path.join(firstDirectory, file.filename))).toEqual(file.contents);
    }

    const aggregate = JSON.parse(fs.readFileSync(path.join(root, 'reports', 'aggregate-data.json'), 'utf8')) as {
      projects: Array<{ projectId: string; runs: Array<{ buildNumber: number; runId: string; manifestPath: string; reportPath?: string }> }>;
    };
    const aggregateHtml = fs.readFileSync(path.join(root, 'reports', 'index.html'), 'utf8');
    const runs = aggregate.projects.find((item) => item.projectId === 'service-a')?.runs ?? [];
    expect(runs).toHaveLength(2);
    expect(new Set(runs.map((item) => item.runId))).toEqual(new Set([firstOutcome.runId, secondOutcome.runId]));
    for (const runEntry of runs) {
      expect(runEntry.buildNumber).toBe(42);
      const manifestPath = path.join(root, 'reports', runEntry.manifestPath);
      expect(fs.existsSync(manifestPath)).toBe(true);
      expect(runEntry.reportPath).toBeDefined();
      expect(fs.existsSync(path.join(root, 'reports', runEntry.reportPath!))).toBe(true);
      expect(aggregateHtml).toContain(`href="${runEntry.reportPath!}"`);
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as { run: { runId: string }; jenkins: { buildNumber: number } };
      expect(manifest.run.runId).toBe(runEntry.runId);
      expect(manifest.jenkins.buildNumber).toBe(42);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
