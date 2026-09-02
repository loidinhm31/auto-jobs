import type { BrowserContext, Route } from '@playwright/test';

import { sanitizeUrl } from '../config-errors.js';
import { escapeHtml, isExactFixtureUrl } from './template-fixture-html.js';
import type {
  MutableTemplateRouteRecorder,
  TemplateReportFixture,
  TemplateResponse,
  TemplateRouteMiss,
  TemplateRouteRecorder,
} from './template-fixture-types.js';

const MAX_TEMPLATE_ROUTE_MISSES = 32;
const MAX_TEMPLATE_ROUTE_METHOD_LENGTH = 32;
const MAX_TEMPLATE_ROUTE_ORIGIN_LENGTH = 256;
const MAX_TEMPLATE_ROUTE_PATH_LENGTH = 2_048;

function recordTemplateRouteMiss(
  recorder: MutableTemplateRouteRecorder,
  method: string,
  rawUrl: string,
): void {
  if (recorder.misses.length >= MAX_TEMPLATE_ROUTE_MISSES) {
    recorder.truncated = true;
    return;
  }
  let origin = '[invalid]';
  let pathname = '[invalid]';
  try {
    const url = new URL(sanitizeUrl(rawUrl));
    origin = url.origin.slice(0, MAX_TEMPLATE_ROUTE_ORIGIN_LENGTH);
    pathname = url.pathname.slice(0, MAX_TEMPLATE_ROUTE_PATH_LENGTH);
  } catch {
    // Preserve only the invalid marker; raw request URLs may contain secrets.
  }
  recorder.misses.push({
    method: method.slice(0, MAX_TEMPLATE_ROUTE_METHOD_LENGTH),
    origin,
    pathname,
  });
}

async function abortTemplateRoute(
  route: Route,
  recorder: MutableTemplateRouteRecorder,
  errorCode?: 'blockedbyclient',
): Promise<void> {
  const request = route.request();
  recordTemplateRouteMiss(recorder, request.method(), request.url());
  if (errorCode === undefined) await route.abort();
  else await route.abort(errorCode);
}

export function templateResponse(
  url: URL,
  fixture: TemplateReportFixture,
): TemplateResponse | undefined {
  if (isExactFixtureUrl(url, fixture.loginUrl)) {
    return { body: fixture.loginHtml, contentType: 'text/html; charset=utf-8' };
  }
  if (isExactFixtureUrl(url, fixture.jobUrl)) {
    return { body: fixture.jenkinsHtml, contentType: 'text/html; charset=utf-8' };
  }
  if (isExactFixtureUrl(url, fixture.buildPageUrl)) {
    return { body: fixture.buildHtml, contentType: 'text/html; charset=utf-8' };
  }
  if (isExactFixtureUrl(url, fixture.snykReportUrl)) {
    return { body: fixture.snykHtml, contentType: 'text/html; charset=utf-8' };
  }
  if (isExactFixtureUrl(url, fixture.snykSummaryUrl)) {
    return { body: fixture.snykSummary, contentType: 'application/json; charset=utf-8' };
  }
  if (isExactFixtureUrl(url, fixture.sonarqubeLoginUrl)) {
    return { body: fixture.sonarqubeLoginHtml, contentType: 'text/html; charset=utf-8' };
  }
  if (isExactFixtureUrl(url, fixture.sonarqubeOverallUrl)) {
    return { body: fixture.sonarqubeOverallHtml, contentType: 'text/html; charset=utf-8' };
  }
  if (isExactFixtureUrl(url, fixture.sonarqubeHomeUrl)) {
    return { body: fixture.sonarqubeHomeHtml, contentType: 'text/html; charset=utf-8' };
  }
  if (isExactFixtureUrl(url, fixture.sonarqubeIssuesUrl)) {
    return { body: fixture.sonarqubeIssuesHtml, contentType: 'text/html; charset=utf-8' };
  }
  return undefined;
}

export async function installTemplateReportRoutes(
  context: BrowserContext,
  fixture: TemplateReportFixture,
): Promise<TemplateRouteRecorder> {
  const recorder: MutableTemplateRouteRecorder = { misses: [], truncated: false };
  const fixtureOrigin = new URL(fixture.jobUrl).origin;
  let sonarqubeAuthenticated = false;

  await context.route('**/*', async (route: Route) => {
    const request = route.request();
    let url: URL;
    try {
      url = new URL(request.url());
    } catch {
      await abortTemplateRoute(route, recorder);
      return;
    }
    if (url.origin !== fixtureOrigin) {
      await abortTemplateRoute(route, recorder);
      return;
    }
    if (request.method() === 'POST' && isExactFixtureUrl(url, fixture.loginActionUrl)) {
      await route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: `<!doctype html><meta http-equiv="refresh" content="0; url=${escapeHtml(fixture.jobUrl)}"><a href="${escapeHtml(fixture.jobUrl)}">Continue</a>`,
      });
      return;
    }
    if (
      request.method() === 'POST' &&
      (isExactFixtureUrl(url, fixture.sonarqubeLoginActionUrl) ||
        isExactFixtureUrl(url, fixture.sonarqubeLoginUrl) ||
        url.pathname === '/sessions/new')
    ) {
      sonarqubeAuthenticated = true;
      await route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: `<!doctype html><meta http-equiv="refresh" content="0; url=${escapeHtml(fixture.sonarqubeHomeUrl)}"><a href="${escapeHtml(fixture.sonarqubeHomeUrl)}">Continue</a>`,
      });
      return;
    }
    if (request.method() === 'POST' && isExactFixtureUrl(url, fixture.buildActionUrl)) {
      await route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: `<!doctype html><meta http-equiv="refresh" content="0; url=${escapeHtml(fixture.jobUrl)}"><a href="${escapeHtml(fixture.jobUrl)}">Continue</a>`,
      });
      return;
    }
    if (!['GET', 'HEAD'].includes(request.method())) {
      await abortTemplateRoute(route, recorder, 'blockedbyclient');
      return;
    }
    if (isExactFixtureUrl(url, fixture.sonarqubeHomeUrl) && !sonarqubeAuthenticated) {
      await route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: fixture.sonarqubeLoginHtml,
      });
      return;
    }
    const response = templateResponse(url, fixture);
    if (response === undefined) {
      await abortTemplateRoute(route, recorder, 'blockedbyclient');
      return;
    }
    await route.fulfill({ status: 200, contentType: response.contentType, body: response.body });
  });

  return recorder;
}
