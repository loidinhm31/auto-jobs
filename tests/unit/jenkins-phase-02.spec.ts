import { expect, test, type Page } from '@playwright/test';

import { parseConfig } from '../../src/config.js';
import { openExistingBuild, resolveQueuedBuild } from '../../src/jenkins/build.js';
import { resolveJenkinsJob, type JenkinsJobReference } from '../../src/jenkins/job.js';
import { UiBuildTrigger } from '../../src/jenkins/trigger.js';
import { parseBuildReference, parseQueueReference } from '../../src/jenkins/url-identity.js';
import { WorkflowDeadline } from '../../src/workflow/workflow-deadline.js';
import { pollUntil } from '../../src/workflow/poll-until.js';

function config() {
  return parseConfig({
    JENKINS_BASE_URL: 'https://jenkins.example/jenkins',
    JENKINS_USERNAME: 'user',
    JENKINS_PASSWORD: 'password',
    JENKINS_JOB_PATH: 'service-a',
    JENKINS_TIMEOUT_MS: '1000',
    JENKINS_POLL_INTERVAL_MS: '1',
    JENKINS_BUILD_URL_SELECTOR: JSON.stringify({ kind: 'css', value: 'a[href]', required: true }),
  });
}

function job(): JenkinsJobReference {
  return {
    name: 'service-a',
    path: 'service-a',
    url: 'https://jenkins.example/jenkins/job/service-a/',
  };
}

async function serve(page: Page, body: string) {
  await page.route('https://jenkins.example/jenkins/**', (route) => route.fulfill({
    contentType: 'text/html', body,
  }));
  await page.goto(job().url);
}

test('uses immutable deadline budget and configured polling cadence', async () => {
  const deadline = new WorkflowDeadline(100, 1_000);
  expect(deadline.expiresAt).toBe(1_100);
  expect(deadline.remainingMs(1_050)).toBe(50);
  let attempts = 0;
  const result = await pollUntil({
    deadline: new WorkflowDeadline(100), intervalMs: 1,
    observe: async () => ++attempts, accept: (value) => value === 2,
  });
  expect(result.value).toBe(2);
  expect(attempts).toBe(2);
});

test('parses only exact same-context queue and build references', () => {
  expect(parseQueueReference('https://jenkins.example/jenkins/queue/item/7/', config().baseUrl))
    .toEqual({ id: 7, url: 'https://jenkins.example/jenkins/queue/item/7/' });
  expect(parseQueueReference('https://jenkins.example/queue/item/7/', config().baseUrl)).toBeUndefined();
  expect(parseQueueReference('https://jenkins.example/jenkins/queue/item/999999999999999999999/', config().baseUrl))
    .toBeUndefined();
  expect(parseBuildReference('https://jenkins.example/jenkins/job/service-a/8/', config().baseUrl, job().url))
    .toEqual({ number: 8, url: 'https://jenkins.example/jenkins/job/service-a/8/' });
  expect(parseBuildReference('https://jenkins.example/jenkins/job/other/8/', config().baseUrl, job().url))
    .toBeUndefined();
  expect(parseBuildReference('https://evil.example/jenkins/job/service-a/8/', config().baseUrl, job().url))
    .toBeUndefined();
});

test('rejects a similar Jenkins heading rather than accepting a substring', async ({ page }) => {
  await serve(page, '<h1>service-a-old</h1>');
  await expect(resolveJenkinsJob(page, config(), new WorkflowDeadline(500))).rejects.toThrow(
    /job resolution failed/u,
  );
});

test('defers parameterized jobs without any interaction or baseline', async ({ page }) => {
  await serve(page, '<button onclick="window.wasClicked = true">Build with Parameters</button>');
  const trigger = new UiBuildTrigger(page, config(), job(), new WorkflowDeadline(500));
  const result = await trigger.trigger();
  expect(result).toMatchObject({
    triggered: false, capability: 'unsupported_parameterized', triggerAttempts: 0,
    state: 'unsupported_parameterized',
  });
  expect(result.baseline).toBeUndefined();
  expect(await page.evaluate(() => (window as Window & { wasClicked?: boolean }).wasClicked)).toBeUndefined();
});

test('captures a pre-click baseline and accepts only a new correlated queue item', async ({ page }) => {
  await serve(page, `<button>Build Now</button>
    <a href="/jenkins/queue/item/30/">old</a><a href="/jenkins/job/service-a/2/">2</a>`);
  await page.route('https://jenkins.example/jenkins/queue/item/31/', (route) => route.fulfill({
    contentType: 'text/html', body: '<a href="/jenkins/queue/item/31/">queue 31</a>',
  }));
  await page.getByRole('button', { name: 'Build Now', exact: true }).evaluate((button) => {
    button.addEventListener('click', () => window.location.assign('/jenkins/queue/item/31/'));
  });
  const trigger = new UiBuildTrigger(page, config(), job(), new WorkflowDeadline(500));
  const result = await trigger.trigger();
  expect(result).toMatchObject({
    triggered: true, capability: 'build_now', triggerAttempts: 1, state: 'queue_correlated',
    queueUrl: 'https://jenkins.example/jenkins/queue/item/31/',
    baseline: { latestBuildNumber: 2, queueItems: [{ id: 30 }] },
  });
  await expect(trigger.trigger()).rejects.toThrow(/already evaluated/u);
});

test('accepts a new queue link rendered by the Build Now document navigation', async ({ page }) => {
  await serve(page, '<button>Build Now</button><a href="/jenkins/queue/item/30/">old</a>');
  await page.route('https://jenkins.example/jenkins/job/service-a/?submitted=1', (route) => route.fulfill({
    contentType: 'text/html', body: '<a href="/jenkins/queue/item/31/">queue 31</a>',
  }));
  await page.getByRole('button', { name: 'Build Now', exact: true }).evaluate((button) => {
    button.addEventListener('click', () => window.location.assign('/jenkins/job/service-a/?submitted=1'));
  });
  await expect(new UiBuildTrigger(page, config(), job(), new WorkflowDeadline(500)).trigger())
    .resolves.toMatchObject({ state: 'queue_correlated', queueUrl: 'https://jenkins.example/jenkins/queue/item/31/' });
});

test('correlates a Build Now response through its exact queue Location', async ({ page }) => {
  await serve(page, '<a href="/jenkins/job/service-a/build?delay=0sec">Build Now</a><a href="/jenkins/queue/item/30/">old</a>');
  await page.route('**/job/service-a/build**', async (route) => {
    await route.fulfill({ status: 201, headers: { location: '/jenkins/queue/item/31/' }, body: '' });
  });
  await expect(new UiBuildTrigger(page, config(), job(), new WorkflowDeadline(500)).trigger())
    .resolves.toMatchObject({ state: 'queue_correlated', queueUrl: 'https://jenkins.example/jenkins/queue/item/31/' });
});

test('does not correlate an unrelated queue item when a Build Now POST has no Location', async ({ page }) => {
  await serve(page, '<button>Build Now</button><a href="/jenkins/queue/item/30/">old</a>');
  await page.route('**/job/service-a/build**', async (route) => {
    await route.fulfill({ status: 201, body: '' });
  });
  await page.getByRole('button', { name: 'Build Now', exact: true }).evaluate((button) => {
    button.addEventListener('click', () => {
      document.body.insertAdjacentHTML('beforeend', '<a href="/jenkins/queue/item/31/">unrelated</a>');
      void fetch('/jenkins/job/service-a/build', { method: 'POST' });
    });
  });
  await expect(new UiBuildTrigger(page, config(), job(), new WorkflowDeadline(500)).trigger()).rejects.toThrow(
    /build trigger failed/u,
  );
});

test('rejects generic latest-build links after a Build Now submission', async ({ page }) => {
  await serve(page, '<a href="/jenkins/job/service-a/lastBuild/">last build</a>');
  await page.setContent('<button>Build Now</button><a href="/jenkins/job/service-a/lastBuild/">last build</a>');
  await expect(new UiBuildTrigger(page, config(), job(), new WorkflowDeadline(100)).trigger()).rejects.toThrow(
    /build trigger failed/u,
  );
});

test('rejects a concurrent queue link that was not the Build Now navigation response', async ({ page }) => {
  await serve(page, '<button>Build Now</button>');
  await page.getByRole('button', { name: 'Build Now', exact: true }).evaluate((button) => {
    button.addEventListener('click', () => document.body.insertAdjacentHTML(
      'beforeend', '<a href="/jenkins/queue/item/99/">concurrent</a>',
    ));
  });
  await expect(new UiBuildTrigger(page, config(), job(), new WorkflowDeadline(100)).trigger()).rejects.toThrow(
    /build trigger failed/u,
  );
});

test('validates exact existing build URLs without a trigger', async ({ page }) => {
  await serve(page, '<h1>service-a</h1>');
  const runConfig = { ...config(), buildNumber: 8 };
  await page.route('https://jenkins.example/jenkins/job/service-a/8/', (route) => route.fulfill({
    contentType: 'text/html', body: '<h1>service-a</h1><a href="/jenkins/job/service-a/8/">build 8</a>',
  }));
  await expect(openExistingBuild(page, runConfig, job(), new WorkflowDeadline(500))).resolves.toEqual({
    number: 8, url: 'https://jenkins.example/jenkins/job/service-a/8/',
  });
});

test('rejects a 404 page that preserves an existing-build URL', async ({ page }) => {
  await page.route('https://jenkins.example/jenkins/job/service-a/8/', (route) => route.fulfill({
    status: 404, contentType: 'text/html',
    body: '<h1>Not Found</h1><a href="/jenkins/job/service-a/8/">build 8</a>',
  }));
  await expect(openExistingBuild(
    page, { ...config(), buildNumber: 8 }, job(), new WorkflowDeadline(500),
  )).rejects.toThrow(/existing build selection failed/u);
});

test('resolves a build only from the correlated queue item', async ({ page }) => {
  await page.route('https://jenkins.example/jenkins/queue/item/31/', (route) => route.fulfill({
    contentType: 'text/html', body: '<a href="/jenkins/job/service-a/3/">build 3</a>',
  }));
  await expect(resolveQueuedBuild(
    page, config(), job(), { id: 31, url: 'https://jenkins.example/jenkins/queue/item/31/' },
    2, new WorkflowDeadline(500),
  )).resolves.toEqual({ number: 3, url: 'https://jenkins.example/jenkins/job/service-a/3/' });
});
