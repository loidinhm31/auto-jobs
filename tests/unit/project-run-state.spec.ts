import { expect, test } from '@playwright/test';

import { ProjectRunState } from '../../src/project/project-run-state.js';

function state(): ProjectRunState {
  return new ProjectRunState({
    projectId: 'service-a',
    projectName: 'Service A',
    jobUrl: 'https://jenkins.example/job/service-a/',
    runId: '20260824t040000000z-0123456789abcdef',
    runDirectory: '/tmp/reports/service-a/run',
  });
}

test('tracks the direct configured-to-rendered workflow and freezes identity', () => {
  const run = state();
  expect(run.phase).toBe('configured');
  run.transition('authenticated');
  run.transition('job_opened');
  run.transition('links_discovered');
  run.transition('captured');
  run.transition('rendered');
  expect(run.phase).toBe('rendered');
  expect(run.failure).toBeUndefined();
  expect(Object.isFrozen(run.identity)).toBe(true);
});

test('rejects skipped direct transitions', () => {
  const run = state();
  expect(() => run.transition('captured')).toThrow(/configured -> captured/u);
  run.transition('authenticated');
  expect(() => run.transition('links_discovered')).toThrow(/authenticated -> links_discovered/u);
});

test('allows a failure from an active phase only once', () => {
  const run = state();
  run.transition('authenticated');
  run.fail('safe diagnostic');
  expect(run.phase).toBe('failed');
  expect(run.failure).toBe('safe diagnostic');
  expect(() => run.fail('again')).toThrow(/Cannot fail/u);
});
