import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { expect, test, type Browser } from '@playwright/test';

import { loadProjectConfig } from '../../src/config.js';
import type { CaptureResult } from '../../src/project/project-runner.js';
import { runProject } from '../../src/project/project-runner.js';
import type { ProjectWorkflow } from '../../src/project/project-workflow.js';
import { runConfiguredProjects } from '../../src/runner.js';

test.use({ trace: 'on-first-retry', screenshot: 'off', video: 'off' });

function writeConfig(root: string): string {
  const filename = path.join(root, 'projects.json');
  fs.writeFileSync(filename, JSON.stringify({
    schemaVersion: 1,
    defaults: { artifactDir: path.join(root, 'reports'), timeoutMs: 10_000 },
    projects: [
      { id: 'service-a', name: 'Service A', loginUrl: 'https://jenkins.example/login', jobUrl: 'https://jenkins.example/job/service-a/', credentials: { usernameVariable: 'A_USER', passwordVariable: 'A_PASSWORD' } },
      { id: 'service-b', name: 'Service B', loginUrl: 'https://jenkins.example/login', jobUrl: 'https://jenkins.example/job/service-b/', credentials: { usernameVariable: 'B_USER', passwordVariable: 'B_PASSWORD' } },
    ],
  }), { mode: 0o600 });
  return filename;
}

function completeCapture(jobUrl: string): CaptureResult {
  const target = (key: 'jenkins-job' | 'snyk-report' | 'sonarqube-home' | 'sonarqube-overall' | 'sonarqube-issues') => ({ key, localAnchor: `#${key}`, state: 'found' as const });
  const source = { state: 'found' as const, captures: [], navigation: [], warnings: [] };
  const snykSource = { ...source, navigation: [target('snyk-report')] };
  const sonarqubeSource = {
    ...source,
    navigation: [target('sonarqube-home'), target('sonarqube-overall'), target('sonarqube-issues')],
  };
  return {
    navigation: {
      'jenkins-job': { ...target('jenkins-job'), localAnchor: '#jenkins', liveUrl: jobUrl },
      'snyk-report': target('snyk-report'), 'sonarqube-home': target('sonarqube-home'),
      'sonarqube-overall': target('sonarqube-overall'), 'sonarqube-issues': target('sonarqube-issues'),
    },
    reports: { snyk: snykSource, sonarqube: sonarqubeSource }, warnings: [],
  };
}

test('runs two projects in order with fresh browser state and later-project continuation', async ({ browser }) => {
  test.setTimeout(60_000);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'direct-multi-project-'));
  const environment = { A_USER: 'user-a', A_PASSWORD: 'password-a', B_USER: 'user-b', B_PASSWORD: 'password-b' };
  let runnerBrowser: Browser | undefined;
  try {
    const projects = loadProjectConfig(writeConfig(root), environment);
    runnerBrowser = await browser.browserType().launch();
    const order: string[] = [];
    const observations: Array<{ projectId: string; cookies: string[] }> = [];
    let suffix = 0;
    const workflow: ProjectWorkflow = async (page, project, _secrets, _deadline, state) => {
      order.push(project.id);
      await page.route('http://fixture.test/**', async (route) => route.fulfill({ status: 200, contentType: 'text/html', body: `<body data-project="${project.id}">${project.name}</body>` }));
      await page.goto(`http://fixture.test/${project.id}`);
      observations.push({ projectId: project.id, cookies: (await page.context().cookies('http://fixture.test')).map((cookie) => `${cookie.name}=${cookie.value}`) });
      await page.context().addCookies([{ name: 'project', value: project.id, url: 'http://fixture.test/' }]);
      state.transition('authenticated');
      if (project.id === 'service-a') throw new Error('fixture project rejected');
      state.transition('job_opened');
      return { jobUrl: project.jobUrl, observedAt: '2026-08-24T04:00:00.000Z' };
    };
    const result = await runConfiguredProjects(projects, {
      runtimeEnvironment: environment,
      launchBrowser: async () => runnerBrowser!,
      now: () => new Date('2026-08-24T04:00:00.000Z'),
      runIdSuffix: () => (++suffix).toString(16).padStart(16, '0'),
      executeProject: async (project, dependencies) => runProject(project, {
        ...dependencies,
        workflow,
        capture: async ({ page }) => {
          expect(await page.locator('body').getAttribute('data-project')).toBe(project.id);
          expect(await page.context().cookies('http://fixture.test')).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'project', value: project.id })]));
          return completeCapture(project.jobUrl);
        },
      }),
    });
    expect(order).toEqual(['service-a', 'service-b']);
    expect(observations).toEqual([{ projectId: 'service-a', cookies: [] }, { projectId: 'service-b', cookies: [] }]);
    expect(result.outcomes.map((outcome) => outcome.state)).toEqual(['failed', 'success']);
    expect(result.exitCode).toBe(1);
    expect(result.aggregate.projects.map((project) => project.projectId)).toEqual(['service-a', 'service-b']);
    const success = result.outcomes[1]!;
    expect(fs.existsSync(path.join(success.reportDirectory!, 'data.json'))).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(success.reportDirectory!, 'data.json'), 'utf8')).project.id).toBe('service-b');
    expect(JSON.stringify(result.aggregate)).not.toContain('buildNumber');
  } finally {
    await runnerBrowser?.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
