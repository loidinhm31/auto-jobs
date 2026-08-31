import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { expect, test, type Browser } from '@playwright/test';

import { loadProjectConfig } from '../../src/config.js';
import type { CaptureResult } from '../../src/project/project-runner.js';
import { runProject } from '../../src/project/project-runner.js';
import type { ProjectWorkflow } from '../../src/project/project-workflow.js';
import { runConfiguredProjects } from '../../src/runner.js';

function writeConfig(root: string): string {
  const filename = path.join(root, 'projects.json');
  fs.writeFileSync(filename, JSON.stringify({
    schemaVersion: 1,
    defaults: { artifactDir: path.join(root, 'reports'), timeoutMs: 10_000 },
    projects: [{
      id: 'service-a', name: 'Service A', loginUrl: 'https://jenkins.example/login',
      jobUrl: 'https://jenkins.example/job/service-a/',
      credentials: { usernameVariable: 'USER', passwordVariable: 'PASSWORD' },
    }],
  }), { mode: 0o600 });
  return filename;
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
    reports: { snyk: snykSource, sonarqube: sonarqubeSource },
    warnings: [],
  };
}

test('keeps direct same-job reruns in immutable report folders and aggregate links', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'direct-run-history-'));
  try {
    const environment = { USER: 'fixture-user', PASSWORD: 'fixture-password' };
    const project = loadProjectConfig(writeConfig(root), environment)[0]!;
    const browser = {
      newContext: async () => ({ newPage: async () => ({}), close: async () => undefined }),
      close: async () => undefined,
    } as unknown as Browser;
    const workflow: ProjectWorkflow = async (_page, currentProject, _secrets, _deadline, state) => {
      state.transition('authenticated');
      state.transition('job_opened');
      return { jobUrl: currentProject.jobUrl, observedAt: '2026-08-24T04:00:00.000Z' };
    };
    let suffix = 0;
    const run = () => runConfiguredProjects([project], {
      runtimeEnvironment: environment,
      launchBrowser: async () => browser,
      runIdSuffix: () => (++suffix).toString(16).padStart(16, '0'),
      now: () => new Date('2026-08-24T04:00:00.000Z'),
      executeProject: async (currentProject, dependencies) => runProject(currentProject, {
        ...dependencies,
        workflow,
        capture: async () => completeCapture(currentProject.jobUrl),
      }),
    });

    const first = await run();
    const firstOutcome = first.outcomes[0]!;
    const firstDirectory = firstOutcome.reportDirectory!;
    const snapshot = ['data.json', 'index.html', 'manifest.json'].map((filename) => ({
      filename, contents: fs.readFileSync(path.join(firstDirectory, filename)),
    }));
    const second = await run();
    const secondOutcome = second.outcomes[0]!;

    expect(firstOutcome.state).toBe('success');
    expect(secondOutcome.state).toBe('success');
    expect(secondOutcome.reportDirectory).not.toBe(firstDirectory);
    for (const file of snapshot) expect(fs.readFileSync(path.join(firstDirectory, file.filename))).toEqual(file.contents);

    const runs = first.aggregate.projects[0]?.runs ?? [];
    const rerunEntries = second.aggregate.projects[0]?.runs ?? [];
    expect(runs).toHaveLength(1);
    expect(rerunEntries).toHaveLength(2);
    expect(new Set(rerunEntries.map((item) => item.runId))).toEqual(new Set([firstOutcome.runId, secondOutcome.runId]));
    expect(JSON.stringify(second.aggregate)).not.toContain('buildNumber');
    for (const entry of rerunEntries) {
      expect(entry.manifestPath).toBe(`service-a/${entry.runId}/manifest.json`);
      expect(entry.reportPath).toBe(`service-a/${entry.runId}/index.html`);
      expect(fs.existsSync(path.join(root, 'reports', entry.manifestPath))).toBe(true);
      expect(fs.existsSync(path.join(root, 'reports', entry.reportPath!))).toBe(true);
      const manifest = JSON.parse(fs.readFileSync(path.join(root, 'reports', entry.manifestPath), 'utf8')) as { schemaVersion: number; jenkins?: { jobUrl: string } };
      expect(manifest.schemaVersion).toBe(3);
      expect(manifest.jenkins?.jobUrl).toBe(project.jobUrl);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
