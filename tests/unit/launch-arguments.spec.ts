import { expect, test } from '@playwright/test';

// @ts-expect-error JavaScript script module has no declarations
import { parseLaunchArguments as parseReportLaunchArguments } from '../../scripts/run-report.mjs';
// @ts-expect-error JavaScript script module has no declarations
import { parseLaunchArguments as parseTemplateLaunchArguments } from '../../scripts/run-template-report.mjs';

test('parses --env arguments and separates remaining CLI args for report runner', () => {
  const result = parseReportLaunchArguments([
    '--env',
    'PLAYWRIGHT_HEADLESS=false',
    '--env',
    'PLAYWRIGHT_SLOW_MO=500',
    '--config',
    'config/projects.json',
  ]);

  expect(result).toEqual({
    args: ['--config', 'config/projects.json'],
    environment: {
      PLAYWRIGHT_HEADLESS: 'false',
      PLAYWRIGHT_SLOW_MO: '500',
    },
  });
});

test('handles arbitrary placement of --env flags', () => {
  const result = parseReportLaunchArguments([
    '--config',
    'config/projects.json',
    '--env',
    'PLAYWRIGHT_HEADLESS=0',
  ]);

  expect(result).toEqual({
    args: ['--config', 'config/projects.json'],
    environment: {
      PLAYWRIGHT_HEADLESS: '0',
    },
  });
});

test('rejects malformed --env flags in report launch arguments', () => {
  expect(() => parseReportLaunchArguments(['--env'])).toThrow(/--env requires NAME=VALUE/u);
  expect(() => parseReportLaunchArguments(['--env', 'INVALID'])).toThrow(/--env requires NAME=VALUE/u);
  expect(() => parseReportLaunchArguments(['--env', '=value'])).toThrow(/--env requires NAME=VALUE/u);
  expect(() => parseReportLaunchArguments(['--env', '123_BAD=value'])).toThrow(/--env name is invalid/u);
});

test('parses --env arguments for template report runner', () => {
  const result = parseTemplateLaunchArguments([
    '--env',
    'PLAYWRIGHT_HEADLESS=true',
  ]);

  expect(result).toEqual({
    args: [],
    environment: {
      PLAYWRIGHT_HEADLESS: 'true',
    },
  });
});
