import { expect, test } from '@playwright/test';

import { ProjectRunState } from '../../src/project/project-run-state.js';

function state(): ProjectRunState {
  return new ProjectRunState({
    projectId: 'service-a',
    projectName: 'Service A',
    runId: '20260824t040000000z-0123456789abcdef',
    stagingDirectory: '/tmp/artifacts/service-a/run',
  });
}

test('guards the existing-build state path and immutable build identity', () => {
  const run = state();
  run.transition('authenticated');
  run.transition('job_resolved');
  run.transition('existing_build_selected');
  run.bindBuild({ number: 42, url: 'https://jenkins.example/job/service-a/42/' });
  run.bindBuild({ number: 42, url: 'https://jenkins.example/job/service-a/42/' });
  run.transition('running');
  run.transition('terminal');
  run.transition('captured');
  run.transition('rendered');
  expect(run.phase).toBe('rendered');
  expect(run.build?.number).toBe(42);
  expect(Object.isFrozen(run.identity)).toBe(true);
});

test('rejects skipped transitions and build identity mutation', () => {
  const run = state();
  expect(() => run.transition('running')).toThrow(/validated -> running/u);
  run.bindBuild({ number: 1, url: 'https://jenkins.example/job/service-a/1/' });
  expect(() => run.bindBuild({ number: 2, url: 'https://jenkins.example/job/service-a/2/' })).toThrow(
    /cannot change/u,
  );
});

test('rejects build identities with unsafe URL schemes or credentials', () => {
  const state = new ProjectRunState({
    projectId: 'service-a', projectName: 'Service A', runId: 'run-unsafe-url', stagingDirectory: '/tmp/run-unsafe-url',
  });
  expect(() => state.bindBuild({ number: 1, url: 'file:///tmp/build' })).toThrow(/identity/u);
  expect(() => state.bindBuild({ number: 1, url: 'https://user:password@jenkins.example/job/1/' })).toThrow(/identity/u);
});

test('allows a redacted failure from any active phase only once', () => {
  const run = state();
  run.transition('authenticated');
  run.fail('safe diagnostic');
  expect(run.phase).toBe('failed');
  expect(run.failure).toBe('safe diagnostic');
  expect(() => run.fail('again')).toThrow(/Cannot fail/u);
});
