import { expect, type Locator, type Page } from '@playwright/test';

import type { RunnerConfig } from '../config.js';
import type {
  BuildTrigger,
  BuildTriggerResult,
} from '../types.js';
import { formatJenkinsFailure, JenkinsFlowError } from './errors.js';
import {
  buildNumberFromUrl,
  buildReference,
  latestBuildNumber,
  type JenkinsJobReference,
} from './job.js';
import { locatorFor, readFirstHref, selectorDescription } from './locators.js';

function isDefaultTrigger(selector: RunnerConfig['selectors']['trigger']): boolean {
  return (
    selector.kind === 'role' &&
    selector.value === 'button' &&
    selector.name === 'Build Now' &&
    selector.required
  );
}

async function triggerLocator(
  page: Page,
  config: RunnerConfig,
): Promise<Locator> {
  const configured = locatorFor(page, config.selectors.trigger);
  if (!isDefaultTrigger(config.selectors.trigger)) {
    return configured;
  }

  if ((await configured.count()) > 0) {
    return configured.first();
  }

  const classicJenkinsTrigger = page
    .getByRole('link', { name: /^Build(?: Now| with Parameters)$/iu })
    .first();
  if ((await classicJenkinsTrigger.count()) > 0) {
    return classicJenkinsTrigger;
  }
  return configured.first();
}

async function submitParameterFormIfPresent(
  page: Page,
  deadline: number,
): Promise<void> {
  const submit = page.getByRole('button', { name: 'Build', exact: true }).first();
  if ((await submit.count()) === 0) {
    return;
  }
  await expect(submit).toBeVisible({ timeout: deadline });
  await submit.click();
}

async function hasParameterizedTrigger(page: Page): Promise<boolean> {
  const candidates = [
    page.getByRole('link', { name: 'Build with Parameters', exact: true }),
    page.getByRole('button', { name: 'Build with Parameters', exact: true }),
  ];
  for (const candidate of candidates) {
    if ((await candidate.count()) > 0) {
      return true;
    }
  }
  return false;
}

async function waitForHref(
  page: Page,
  selector: RunnerConfig['selectors']['queueUrl'],
  timeout: number,
): Promise<string | undefined> {
  let observed: string | undefined;
  try {
    await expect
      .poll(
        async () => {
          observed = await readFirstHref(locatorFor(page, selector), page);
          return observed ?? '';
        },
        { timeout, intervals: [100, 250, 500, 1_000] },
      )
      .not.toBe('');
  } catch {
    if (selector.required) {
      throw new JenkinsFlowError(
        `required ${selectorDescription(selector)} reference was not observed`,
      );
    }
  }
  return observed;
}

async function waitForNewBuild(
  page: Page,
  job: JenkinsJobReference,
  timeout: number,
): Promise<ReturnType<typeof buildReference> | undefined> {
  let observed: ReturnType<typeof buildReference> | undefined;
  const baseline = job.lastObservedBuildNumber ?? 0;
  try {
    await expect
      .poll(
        async () => {
          await page.reload({ waitUntil: 'domcontentloaded' });
          const number = await latestBuildNumber(page, job.url);
          if (number !== undefined && number > baseline) {
            observed = buildReference(job, number);
          }
          return observed?.number ?? 0;
        },
        { timeout, intervals: [250, 500, 1_000, 2_000] },
      )
      .toBeGreaterThan(baseline);
  } catch {
    return undefined;
  }
  return observed;
}

export class UiBuildTrigger implements BuildTrigger {
  private triggerSubmitted = false;

  public constructor(
    private readonly page: Page,
    private readonly config: RunnerConfig,
    private readonly job: JenkinsJobReference,
  ) {}

  public async trigger(): Promise<BuildTriggerResult> {
    if (this.triggerSubmitted) {
      throw new JenkinsFlowError('Jenkins UI trigger already submitted for this run');
    }
    try {
      if (await hasParameterizedTrigger(this.page)) {
        this.triggerSubmitted = false;
        return {
          triggered: false,
          capability: 'unsupported_parameterized',
          triggerAttempts: 0,
        };
      }
      const deadline = Math.min(this.config.timeoutMs, 30_000);
      const trigger = await triggerLocator(this.page, this.config);
      await expect(trigger).toBeVisible({ timeout: deadline });
      await expect(trigger).toBeEnabled({ timeout: deadline });
      this.triggerSubmitted = true;
      await trigger.click();
      await submitParameterFormIfPresent(
        this.page,
        Math.min(this.config.timeoutMs, 10_000),
      );

      const currentBuildNumber = buildNumberFromUrl(this.job.url, this.page.url());
      const currentBuild =
        currentBuildNumber === undefined
          ? undefined
          : buildReference(this.job, currentBuildNumber);
      const queueUrl = await waitForHref(
        this.page,
        this.config.selectors.queueUrl,
        Math.min(this.config.timeoutMs, 5_000),
      );
      const resolvedBuild =
        currentBuild ??
        (queueUrl === undefined
          ? await waitForNewBuild(
              this.page,
              this.job,
              Math.min(this.config.timeoutMs, 15_000),
            )
          : undefined);

      if (queueUrl === undefined && resolvedBuild === undefined) {
        throw new JenkinsFlowError('no Jenkins queue or new-build reference was observed');
      }

      const result: BuildTriggerResult = {
        triggered: true,
        capability: 'build_now',
        triggerAttempts: 1,
      };
      if (queueUrl !== undefined) {
        result.queueUrl = queueUrl;
      }
      if (resolvedBuild !== undefined) {
        result.build = resolvedBuild;
      }
      return result;
    } catch (error) {
      if (error instanceof JenkinsFlowError) {
        throw error;
      }
      throw new JenkinsFlowError(
        formatJenkinsFailure(
          'Jenkins UI build trigger failed',
          error,
          this.config,
          this.page,
          this.job.url,
        ),
      );
    }
  }
}
