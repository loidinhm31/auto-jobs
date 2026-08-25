import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { expect, test, type Browser } from '@playwright/test';

import { parseProjectsConfig } from '../../src/config.js';
import type { CaptureResult } from '../../src/project/project-runner.js';
import { runProject } from '../../src/project/project-runner.js';
import type { ProjectWorkflow } from '../../src/project/project-workflow.js';
import { runConfiguredProjects } from '../../src/runner.js';

test.use({ trace: 'on-first-retry', screenshot: 'off', video: 'off' });

function writeConfig(root: string): string {
  const filename = path.join(root, 'projects.json');
  fs.writeFileSync(filename, JSON.stringify({
    schemaVersion: 1,
    defaults: { artifactDir: path.join(root, 'reports'), timeoutMs: 10_000, pollIntervalMs: 50 },
    projects: [
      { id: 'service-a', name: 'Service A', baseUrl: 'https://jenkins.example', jobPath: 'service-a', buildNumber: 11, credentials: { usernameVariable: 'A_USER', passwordVariable: 'A_PASSWORD' } },
      { id: 'service-b', name: 'Service B', baseUrl: 'https://jenkins.example', jobPath: 'service-b', buildNumber: 12, credentials: { usernameVariable: 'B_USER', passwordVariable: 'B_PASSWORD' } },
    ],
  }), { mode: 0o600 });
  return filename;
}

function completeCapture(buildUrl: string): CaptureResult {
  const target = (key: 'jenkins-build' | 'snyk-report' | 'sonarqube-home' | 'sonarqube-overall' | 'sonarqube-issues') => ({
    key, localAnchor: `#${key}`, state: 'found' as const,
  });
  const source = { state: 'found' as const, captures: [], navigation: [], warnings: [] };
  return {
    navigation: {
      'jenkins-build': { ...target('jenkins-build'), liveUrl: buildUrl },
      'snyk-report': target('snyk-report'), 'sonarqube-home': target('sonarqube-home'),
      'sonarqube-overall': target('sonarqube-overall'), 'sonarqube-issues': target('sonarqube-issues'),
    },
    reports: { snyk: source, sonarqube: source }, warnings: [],
  };
}

test('runs two projects in order with fresh browser state and later-project continuation', async ({ browser }) => {
  test.setTimeout(60_000);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-07-multi-project-e2e-'));
  const environment = {
    PROJECTS_CONFIG_PATH: writeConfig(root), A_USER: 'user-a', A_PASSWORD: 'password-a',
    B_USER: 'user-b', B_PASSWORD: 'password-b',
  };
  let runnerBrowser: Browser | undefined;
  try {
    const projects = parseProjectsConfig(environment).projects;
    runnerBrowser = await browser.browserType().launch();
    const order: string[] = [];
    const observations: Array<{ projectId: string; cookies: string[] }> = [];
    let suffix = 0;
    const workflow: ProjectWorkflow = async (page, project, _secrets, _deadline, state) => {
      order.push(project.id);
      await page.route('http://fixture.test/**', async (route) => route.fulfill({
        status: 200, contentType: 'text/html', body: `<body data-project="${project.id}">${project.name}</body>`,
      }));
      await page.goto(`http://fixture.test/${project.id}`);
      const cookies = await page.context().cookies('http://fixture.test');
      observations.push({ projectId: project.id, cookies: cookies.map((cookie) => `${cookie.name}=${cookie.value}`) });
      await page.context().addCookies([{ name: 'project', value: project.id, url: 'http://fixture.test/' }]);
      state.transition('authenticated');
      if (project.id === 'service-a') throw new Error('fixture parameterized project rejected');
      const build = { number: project.buildNumber as number, url: `${project.jobUrl}${project.buildNumber}/` };
      state.transition('job_resolved'); state.transition('existing_build_selected');
      state.bindBuild(build); state.transition('running'); state.transition('terminal');
      return {
        terminal: { build, status: 'SUCCESS', observedAt: '2026-08-24T04:00:00.000Z', observationErrors: [], reloadCount: 0 },
        trigger: { capability: 'existing_build', triggerAttempts: 0, build, warnings: [] },
      };
    };
    const result = await runConfiguredProjects(projects, {
      runtimeEnvironment: environment,
      launchBrowser: async () => runnerBrowser!,
      now: () => new Date('2026-08-24T04:00:00.000Z'),
      runIdSuffix: () => (++suffix).toString(16).padStart(16, '0'),
      executeProject: async (project, dependencies) => runProject(project, {
        ...dependencies,
        workflow,
        capture: async ({ page, workflow: completed }) => {
          expect(await page.locator('body').getAttribute('data-project')).toBe(project.id);
          expect(await page.context().cookies('http://fixture.test')).toEqual(expect.arrayContaining([
            expect.objectContaining({ name: 'project', value: project.id }),
          ]));
          return completeCapture(completed.terminal.build.url);
        },
      }),
    });

    expect(order).toEqual(['service-a', 'service-b']);
    expect(observations).toEqual([{ projectId: 'service-a', cookies: [] }, { projectId: 'service-b', cookies: [] }]);
    expect(result.outcomes.map((outcome) => outcome.state)).toEqual(['failed', 'success']);
    expect(result.exitCode).toBe(1);
    expect(result.aggregate.projects.map((project) => project.projectId)).toEqual(['service-a', 'service-b']);
    const success = result.outcomes[1]!;
    expect(success.buildNumber).toBe(12);
    expect(fs.existsSync(path.join(success.reportDirectory!, 'data.json'))).toBe(true);
    const saved = JSON.parse(fs.readFileSync(path.join(success.reportDirectory!, 'data.json'), 'utf8')) as { project: { id: string } };
    expect(saved.project.id).toBe('service-b');
  } finally {
    await runnerBrowser?.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
