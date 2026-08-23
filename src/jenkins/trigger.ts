import { expect, type Locator, type Page, type Response } from '@playwright/test';

import { sanitizeUrl, type RunnerConfig } from '../config.js';
import type { BuildTrigger, BuildTriggerResult, ProjectTriggerState, QueueReference } from '../types.js';
import { WorkflowDeadline } from '../workflow/workflow-deadline.js';
import { pollUntil } from '../workflow/poll-until.js';
import { captureJenkinsBaseline, isNewQueue } from './baseline.js';
import { formatJenkinsFailure, formatJenkinsObservation, JenkinsFlowError } from './errors.js';
import { type JenkinsJobReference } from './job.js';
import { locatorFor, readAllHrefs } from './locators.js';
import { parseBuildReference, parseQueueReference, validateJenkinsUrl } from './url-identity.js';

interface Correlation {
  queue?: QueueReference;
  build?: BuildTriggerResult['build'];
}

function isDefaultTrigger(selector: RunnerConfig['selectors']['trigger']): boolean {
  return selector.kind === 'role' && selector.value === 'button' &&
    selector.name === 'Build Now' && selector.required;
}

async function hasVisible(locator: Locator): Promise<boolean> {
  return (await locator.evaluateAll((elements) => elements.some((element) => {
    const style = window.getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden';
  })));
}

async function hasParameterizedTrigger(page: Page): Promise<boolean> {
  return (await Promise.all([
    page.getByRole('link', { name: 'Build with Parameters', exact: true }),
    page.getByRole('button', { name: 'Build with Parameters', exact: true }),
  ].map(hasVisible))).some(Boolean);
}

async function buildNowLocator(page: Page, config: RunnerConfig): Promise<Locator> {
  if (!isDefaultTrigger(config.selectors.trigger)) return locatorFor(page, config.selectors.trigger).first();
  const controls = [
    page.getByRole('button', { name: 'Build Now', exact: true }),
    page.getByRole('link', { name: 'Build Now', exact: true }),
  ];
  for (const control of controls) if (await hasVisible(control)) return control.first();
  return controls[0]!.first();
}

export class UiBuildTrigger implements BuildTrigger {
  private state: ProjectTriggerState = 'capability_unchecked';

  public constructor(
    private readonly page: Page,
    private readonly config: RunnerConfig,
    private readonly job: JenkinsJobReference,
    private readonly deadline: WorkflowDeadline,
  ) {}

  public async trigger(): Promise<BuildTriggerResult> {
    if (this.state !== 'capability_unchecked') {
      throw new JenkinsFlowError('Jenkins UI trigger capability was already evaluated for this run');
    }
    const diagnostics = { observationErrors: [] as string[], reloadCount: 0 };
    let removeNavigationObserver: (() => void) | undefined;
    try {
      validateJenkinsUrl(this.page.url(), this.config.baseUrl);
      if (await hasParameterizedTrigger(this.page)) {
        this.state = 'unsupported_parameterized';
        return {
          triggered: false,
          capability: 'unsupported_parameterized',
          triggerAttempts: 0,
          state: 'unsupported_parameterized',
          diagnostics: { ...diagnostics, lastSafeUrl: sanitizeUrl(this.page.url()) },
        };
      }

      this.state = 'build_now_ready';
      const trigger = await buildNowLocator(this.page, this.config);
      await expect(trigger).toBeVisible({ timeout: this.deadline.requireRemaining() });
      await expect(trigger).toBeEnabled({ timeout: this.deadline.requireRemaining() });
      const baseline = await captureJenkinsBaseline(this.page, this.config, this.job, this.deadline);
      this.state = 'baseline_captured';
      this.state = 'submitted';
      let responseQueue: QueueReference | undefined;
      let responseBuild: BuildTriggerResult['build'];
      let sawSubmissionNavigation = false;
      let acceptsClickNavigation = true;
      const observeNavigation = (response: Response) => {
        if (!acceptsClickNavigation || !response.request().isNavigationRequest() || response.frame() !== this.page.mainFrame()) return;
        try {
          validateJenkinsUrl(response.url(), this.config.baseUrl);
          sawSubmissionNavigation = true;
        } catch {
          return;
        }
        const queue = parseQueueReference(response.url(), this.config.baseUrl);
        if (queue !== undefined && isNewQueue(queue, baseline)) responseQueue = queue;
        const build = parseBuildReference(response.url(), this.config.baseUrl, this.job.url);
        if (build !== undefined && build.number > (baseline.latestBuildNumber ?? 0)) responseBuild = build;
      };
      this.page.on('response', observeNavigation);
      removeNavigationObserver = () => this.page.off('response', observeNavigation);
      await trigger.click({ timeout: this.deadline.requireRemaining() });

      const result = await pollUntil<Correlation>({
        deadline: this.deadline,
        intervalMs: this.config.pollIntervalMs,
        observe: async () => {
          try {
            validateJenkinsUrl(this.page.url(), this.config.baseUrl);
            const directBuild = parseBuildReference(this.page.url(), this.config.baseUrl, this.job.url);
            if (directBuild !== undefined && directBuild.number > (baseline.latestBuildNumber ?? 0)) {
              return { build: directBuild };
            }
            if (responseBuild !== undefined) return { build: responseBuild };
            if (responseQueue !== undefined) return { queue: responseQueue };
            if (sawSubmissionNavigation) {
              const hrefs = await readAllHrefs(locatorFor(this.page, this.config.selectors.queueUrl), this.page);
              const queue = hrefs
                .map((href) => parseQueueReference(href, this.config.baseUrl))
                .find((candidate): candidate is QueueReference => candidate !== undefined && isNewQueue(candidate, baseline));
              if (queue !== undefined) return { queue };
            }
            if (diagnostics.reloadCount === 0) {
              diagnostics.reloadCount += 1;
              acceptsClickNavigation = false;
              const response = await this.page.reload({
                waitUntil: 'domcontentloaded', timeout: this.deadline.requireRemaining(),
              });
              if (response === null || !response.ok()) throw new Error('Jenkins trigger recovery reload failed');
            }
            return undefined;
          } catch (error) {
            diagnostics.observationErrors.push(formatJenkinsObservation(error, this.config));
            if (diagnostics.reloadCount === 0) {
              diagnostics.reloadCount += 1;
              acceptsClickNavigation = false;
              const response = await this.page.reload({
                waitUntil: 'domcontentloaded', timeout: this.deadline.requireRemaining(),
              });
              if (response === null || !response.ok()) throw new Error('Jenkins trigger recovery reload failed');
            }
            throw error;
          }
        },
        accept: (correlation) => correlation.queue !== undefined || correlation.build !== undefined,
      });

      const output: BuildTriggerResult = {
        triggered: true,
        capability: 'build_now',
        triggerAttempts: 1,
        state: result.value.queue === undefined ? 'build_correlated' : 'queue_correlated',
        baseline,
        diagnostics: { ...diagnostics, lastSafeUrl: sanitizeUrl(this.page.url()) },
      };
      removeNavigationObserver();
      removeNavigationObserver = undefined;
      this.state = output.state;
      if (result.value.queue !== undefined) output.queueUrl = result.value.queue.url;
      if (result.value.build !== undefined) output.build = result.value.build;
      return output;
    } catch (error) {
      removeNavigationObserver?.();
      if (error instanceof JenkinsFlowError) throw error;
      throw new JenkinsFlowError(formatJenkinsFailure(
        'Jenkins UI build trigger failed', error, this.config, this.page, this.job.url,
        diagnostics.observationErrors,
      ));
    }
  }
}
