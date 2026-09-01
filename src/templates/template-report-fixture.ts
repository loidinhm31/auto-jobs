import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { BrowserContext, Route } from '@playwright/test';

import { sanitizeUrl } from '../config-errors.js';
import type { ProjectConfigDocumentV1 } from '../config/config-types.js';
import { parseBrowserName, parsePositiveInteger } from '../config-values.js';

export const TEMPLATE_REPORT_ORIGIN = 'https://templates.invalid';
const TEMPLATE_JENKINS_JOB_ORIGIN = 'https://jenkins-example.example-domain.com';
const TEMPLATE_JENKINS_LOGIN_ORIGIN = 'https://jenkins-jenkins-example.example-domain.com';
const SAVED_SONAR_ORIGIN = 'https://sonarqube.example-domain.com';
const MAX_TEMPLATE_BYTES = 4 * 1_048_576;
export const MAX_TEMPLATE_TOTAL_BYTES = 16 * 1_048_576;
const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export interface TemplateReportFixture {
  readonly loginUrl: string;
  readonly loginActionUrl: string;
  readonly jobUrl: string;
  readonly snykReportUrl: string;
  readonly snykSummaryUrl: string;
  readonly sonarqubeHomeUrl: string;
  readonly sonarqubeOverallUrl: string;
  readonly sonarqubeIssuesUrl: string;
  readonly loginHtml: string;
  readonly jenkinsHtml: string;
  readonly snykHtml: string;
  readonly snykSummary: string;
  readonly sonarqubeHomeHtml: string;
  readonly sonarqubeOverallHtml: string;
  readonly sonarqubeIssuesHtml: string;
  readonly jenkinsTitle: string;
  readonly sonarqubeProjectId: string;
}

export interface TemplateResponse {
  readonly body: string;
  readonly contentType: string;
}

export interface TemplateRouteMiss {
  readonly method: string;
  readonly origin: string;
  readonly pathname: string;
}

export interface TemplateRouteRecorder {
  readonly misses: readonly TemplateRouteMiss[];
  readonly truncated: boolean;
}

interface MutableTemplateRouteRecorder {
  readonly misses: TemplateRouteMiss[];
  truncated: boolean;
}

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

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}
function escapedPattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/giu, '&')
    .replace(/&quot;/giu, '"')
    .replace(/&#39;|&apos;/giu, "'")
    .replace(/&lt;/giu, '<')
    .replace(/&gt;/giu, '>');
}

function elementTags(html: string, name: string): string[] {
  return html.match(new RegExp(`<${name}\\b[\\s\\S]*?>`, 'giu')) ?? [];
}

function attribute(tag: string, name: string): string | undefined {
  const match = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'iu').exec(tag);
  return match?.[2];
}

function parseAbsoluteUrl(raw: string, base: URL | undefined, label: string): URL {
  let url: URL;
  try {
    url = new URL(decodeHtmlEntities(raw), base);
  } catch {
    throw new Error(`Template ${label} URL is malformed`);
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username.length > 0 || url.password.length > 0 || url.hash.length > 0) {
    throw new Error(`Template ${label} URL is unsafe`);
  }
  return url;
}

function parseCanonicalUrl(html: string, label: string): URL {
  const tags = elementTags(html, 'link').filter((tag) =>
    (attribute(tag, 'rel') ?? '').split(/\s+/u).some((value) => value.toLowerCase() === 'canonical'));
  if (tags.length !== 1) throw new Error(`Template ${label} must contain exactly one canonical URL`);
  const rawHref = attribute(tags[0]!, 'href');
  if (rawHref === undefined) throw new Error(`Template ${label} canonical URL is missing`);
  return parseAbsoluteUrl(rawHref, undefined, `${label} canonical`);
}

function anchorUrls(html: string, base: URL, label: string): URL[] {
  const urls: URL[] = [];
  for (const tag of elementTags(html, 'a')) {
    const rawHref = attribute(tag, 'href');
    if (rawHref === undefined) continue;
    try {
      urls.push(parseAbsoluteUrl(rawHref, base, label));
    } catch {
      // Ignore malformed unrelated links; required route selection fails closed below.
    }
  }
  return urls;
}

function rewriteHrefAttributes(
  html: string,
  base: URL,
  rewrite: (url: URL) => string | undefined,
): string {
  return html.replace(/(\bhref\s*=\s*)(["'])([\s\S]*?)\2/giu,
    (whole: string, prefix: string, quote: string, rawHref: string) => {
      let url: URL;
      try { url = parseAbsoluteUrl(rawHref, base, 'link'); } catch { return whole; }
      const replacement = rewrite(url);
      return replacement === undefined ? whole : `${prefix}${quote}${escapeHtml(replacement)}${quote}`;
    });
}

function rewriteFormAction(html: string, savedAction: URL, target: string): string {
  let replacements = 0;
  const rewritten = html.replace(/(<form\b[\s\S]*?\baction\s*=\s*)(["'])([\s\S]*?)\2/iu,
    (whole: string, prefix: string, quote: string, rawAction: string) => {
      let action: URL;
      try { action = parseAbsoluteUrl(rawAction, savedAction, 'login action'); } catch { return whole; }
      if (action.toString() !== savedAction.toString()) return whole;
      replacements += 1;
      return `${prefix}${quote}${escapeHtml(target)}${quote}`;
    });
  if (replacements !== 1) throw new Error('Template login form action could not be rewritten exactly once');
  return rewritten;
}

function exactlyOneQueryValue(url: URL, key: string): string | undefined {
  const values = url.searchParams.getAll(key);
  if (values.length !== 1) return undefined;
  const value = values[0]?.trim();
  return value === undefined || value.length === 0 ? undefined : value;
}

function remapOrigin(url: URL, origin: string): string {
  const target = new URL(origin);
  target.pathname = url.pathname;
  target.search = url.search;
  target.hash = url.hash;
  return target.toString();
}

function selectSingleUrl(values: readonly URL[], label: string): URL {
  const unique = new Map<string, URL>();
  for (const value of values) unique.set(value.toString(), value);
  if (unique.size !== 1) throw new Error(`Template ${label} must resolve to exactly one URL after deduplication`);
  return unique.values().next().value!;
}

interface ArtifactLink {
  readonly url: URL;
  readonly context: string;
  readonly filename: string;
}

function artifactLink(url: URL, origin: string, filename: string): ArtifactLink | undefined {
  if (url.origin !== origin || url.search.length > 0 || url.hash.length > 0) return undefined;
  const canonicalPathname = url.pathname.replace(/\/(?:\*fingerprint\*|\*view\*)\/?$/iu, '');
  const marker = '/artifact/';
  const markerIndex = canonicalPathname.lastIndexOf(marker);
  if (markerIndex < 0 || canonicalPathname.slice(markerIndex + marker.length) !== filename) return undefined;
  const canonicalUrl = new URL(url);
  canonicalUrl.pathname = canonicalPathname;
  return { url: canonicalUrl, context: canonicalPathname.slice(0, markerIndex), filename };
}

function isDashboardPath(url: URL): boolean {
  return url.pathname === '/dashboard' || url.pathname === '/dashboard/';
}

function isProjectIssuesPath(url: URL): boolean {
  return url.pathname === '/project/issues' || url.pathname === '/project/issues/';
}

function isExactFixtureUrl(candidate: URL, expected: string): boolean {
  const target = new URL(expected);
  return candidate.origin === target.origin &&
    candidate.pathname === target.pathname &&
    candidate.search === target.search &&
    candidate.hash === target.hash;
}


async function descriptorPath(fileDescriptor: number): Promise<string> {
  return fs.realpath(path.join('/proc/self/fd', String(fileDescriptor)));
}

interface FileIdentity {
  readonly dev: number;
  readonly ino: number;
}
interface TemplateReadBudget {
  bytes: number;
}

function sameIdentity(left: FileIdentity, right: FileIdentity): boolean {
  return left.ino === right.ino && (left.dev === right.dev || left.dev === 0 || right.dev === 0);
}

async function windowsPathIsSafe(root: string, filename: string, handle?: fs.FileHandle): Promise<boolean> {
  try {
    let current = path.parse(filename).root;
    for (const segment of path.relative(current, filename).split(path.sep).filter(Boolean)) {
      current = path.join(current, segment);
      if ((await fs.lstat(current)).isSymbolicLink()) return false;
    }
    const canonicalRoot = await fs.realpath(root);
    const canonicalFilename = await fs.realpath(filename);
    const relative = path.relative(canonicalRoot, canonicalFilename);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return false;
    if (handle !== undefined) {
      const [pathStat, handleStat] = await Promise.all([fs.stat(filename), handle.stat()]);
      if (pathStat.ino !== handleStat.ino ||
        (pathStat.dev !== 0 && handleStat.dev !== 0 && pathStat.dev !== handleStat.dev)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function readTemplate(
  root: string,
  relativePath: string,
  expectedRootIdentity: FileIdentity,
  budget: TemplateReadBudget,
): Promise<string> {
  const target = path.resolve(root, relativePath);
  const relative = path.relative(root, target);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error('Template path escapes the configured template root');
  const rootHandle = await fs.open(
    root,
    fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW,
  );
  try {
    const openedRoot = process.platform === 'win32' ? root : await descriptorPath(rootHandle.fd);
    if (openedRoot !== root) throw new Error('Template root changed while it was being opened');
    if (process.platform === 'win32' && (!(await windowsPathIsSafe(root, root)) || !(await windowsPathIsSafe(root, root, rootHandle)) || !sameIdentity(await rootHandle.stat(), expectedRootIdentity))) {
      throw new Error('Template root changed while it was being opened');
    }
    if (process.platform === 'win32' && !(await windowsPathIsSafe(root, target))) {
      throw new Error(`Template source contains an unsafe path: ${relativePath}`);
    }
    const templateHandle = await fs.open(
      process.platform === 'win32' ? target : path.join('/proc/self/fd', String(rootHandle.fd), relativePath),
      fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW,
    );
    try {
      const stat = await templateHandle.stat();
      const expectedPath = path.resolve(openedRoot, relativePath);
      if (process.platform === 'win32') {
        if (!(await windowsPathIsSafe(root, root, rootHandle)) || !sameIdentity(await rootHandle.stat(), expectedRootIdentity) || !(await windowsPathIsSafe(root, target, templateHandle))) {
          throw new Error(`Template source contains an unsafe path: ${relativePath}`);
        }
      } else if (await descriptorPath(templateHandle.fd) !== expectedPath) {
        throw new Error(`Template source contains an unsafe path: ${relativePath}`);
      }
      const nextBytes = budget.bytes + stat.size;
      if (!stat.isFile() || stat.size > MAX_TEMPLATE_BYTES || nextBytes > MAX_TEMPLATE_TOTAL_BYTES) {
        throw new Error(`Template source is not a regular file under the per-file and total fixture budgets: ${relativePath}`);
      }
      budget.bytes = nextBytes;
      const bytes = Buffer.alloc(stat.size);
      let offset = 0;
      while (offset < bytes.byteLength) {
        const read = await templateHandle.read(bytes, offset, bytes.byteLength - offset, offset);
        if (read.bytesRead === 0) throw new Error(`Template source changed while it was being read: ${relativePath}`);
        offset += read.bytesRead;
      }
      return bytes.toString('utf8');
    } finally {
      await templateHandle.close();
    }
  } finally {
    await rootHandle.close();
  }
}

function projectIdFromSonarqubeUrl(url: URL): string {
  if (url.origin !== SAVED_SONAR_ORIGIN || !isDashboardPath(url)) {
    throw new Error('SonarQube template does not contain a project dashboard identity');
  }
  const projectId = exactlyOneQueryValue(url, 'id');
  if (projectId === undefined || projectId.length > 512) {
    throw new Error('SonarQube template project identity is unsafe');
  }
  return projectId;
}

interface SonarqubeRouteMap {
  readonly projectId: string;
  readonly homeUrl: string;
  readonly overallUrl: string;
  readonly issuesUrl: string;
}

function rewriteSonarqubeLinks(html: string, routes: SonarqubeRouteMap, projectName: string): string {
  const rewritten = rewriteHrefAttributes(html, new URL(SAVED_SONAR_ORIGIN), (url) => {
    if (url.origin !== SAVED_SONAR_ORIGIN || exactlyOneQueryValue(url, 'id') !== routes.projectId) return undefined;
    if (isDashboardPath(url)) {
      const scopes = url.searchParams.getAll('codeScope');
      if (scopes.length === 0) return routes.homeUrl;
      if (scopes.length === 1 && scopes[0] === 'overall') return routes.overallUrl;
    }
    if (isProjectIssuesPath(url)) return routes.issuesUrl;
    return undefined;
  });
  const withOverallLink = rewritten.replace(
    /<button([^>]*\brole="tab"[^>]*)>\s*Overall Code\s*<\/button>/giu,
    `<a$1 href="${escapeHtml(routes.overallUrl)}">Overall Code</a>`,
  );
  const sourceDisplayName = routes.projectId.slice(routes.projectId.lastIndexOf(':') + 1);
  if (sourceDisplayName === projectName) return withOverallLink;
  return withOverallLink.replace(
    new RegExp(`(<a[^>]*\\bjs-project-link\\b[^>]*>\\s*)${escapedPattern(sourceDisplayName)}(\\s*<\\/a>)`, 'u'),
    (_whole: string, prefix: string, suffix: string) => `${prefix}${escapeHtml(projectName)}${suffix}`,
  );
}
function selectArtifactLink(urls: readonly URL[], origin: string, filename: string, label: string): ArtifactLink {
  const candidates = urls.map((url) => artifactLink(url, origin, filename)).filter((candidate): candidate is ArtifactLink => candidate !== undefined);
  const selected = selectSingleUrl(candidates.map((candidate) => candidate.url), label);
  return candidates.find((candidate) => candidate.url.toString() === selected.toString())!;
}
export async function loadTemplateReportFixture(
  env: NodeJS.ProcessEnv,
  origin = TEMPLATE_REPORT_ORIGIN,
): Promise<TemplateReportFixture> {
  const targetOrigin = new URL(origin).origin;
  const configuredRoot = env['TEMPLATES_DIR']?.trim() || path.join(REPOSITORY_ROOT, 'templates');
  const configuredRootPath = path.resolve(configuredRoot);
  const configuredRootStat = await fs.lstat(configuredRootPath);
  const canonicalRoot = await fs.realpath(configuredRootPath);
  const rootStat = await fs.stat(canonicalRoot);
  const rootIsSafe = process.platform === 'win32'
    ? await windowsPathIsSafe(canonicalRoot, configuredRootPath)
    : canonicalRoot === configuredRootPath;
  if (!configuredRootStat.isDirectory() || configuredRootStat.isSymbolicLink() || !rootIsSafe) {
    throw new Error('Template root must be a real directory without symbolic-link components');
  }
  const root = canonicalRoot;
  const rootIdentity: FileIdentity = { dev: rootStat.dev, ino: rootStat.ino };
  const templateBudget: TemplateReadBudget = { bytes: 0 };
  const jenkinsHtmlRaw = await readTemplate(root, 'jenkins-template/template.html', rootIdentity, templateBudget);
  const loginHtmlRaw = await readTemplate(root, 'jenkins-template/login.html', rootIdentity, templateBudget);
  const snykHtml = await readTemplate(root, 'snyk-template/template.html', rootIdentity, templateBudget);
  const snykSummary = await readTemplate(root, 'snyk-template/snyk-sca-results-summary.json', rootIdentity, templateBudget);
  const sonarqubeHomeRaw = await readTemplate(root, 'sonarqube-template/template-home.html', rootIdentity, templateBudget);
  const sonarqubeOverallRaw = await readTemplate(root, 'sonarqube-template/template-overall.html', rootIdentity, templateBudget);
  const sonarqubeIssuesRaw = await readTemplate(root, 'sonarqube-template/template-issues.html', rootIdentity, templateBudget);

  const jenkinsCanonical = parseCanonicalUrl(jenkinsHtmlRaw, 'Jenkins job');
  if (jenkinsCanonical.origin !== TEMPLATE_JENKINS_JOB_ORIGIN) throw new Error('Jenkins job template origin is not the approved saved origin');
  const loginCanonical = parseCanonicalUrl(loginHtmlRaw, 'Jenkins login');
  if (loginCanonical.origin !== TEMPLATE_JENKINS_LOGIN_ORIGIN) throw new Error('Jenkins login template origin is not the approved saved origin');
  const postForms = elementTags(loginHtmlRaw, 'form').filter((tag) => (attribute(tag, 'method') ?? 'get').trim().toLowerCase() === 'post');
  if (postForms.length !== 1) throw new Error('Template login must contain exactly one POST form');
  const rawAction = attribute(postForms[0]!, 'action');
  if (rawAction === undefined) throw new Error('Template login POST form action is missing');
  const loginAction = parseAbsoluteUrl(rawAction, loginCanonical, 'login action');
  if (loginAction.origin !== loginCanonical.origin) throw new Error('Template login action changed origin');

  const jobLinks = anchorUrls(jenkinsHtmlRaw, jenkinsCanonical, 'Jenkins job');
  const report = selectArtifactLink(jobLinks, jenkinsCanonical.origin, 'snyk-results.html', 'Snyk report');
  const summary = selectArtifactLink(jobLinks, jenkinsCanonical.origin, 'snyk-sca-results-summary.json', 'Snyk summary');
  if (report.context !== summary.context) throw new Error('Template Snyk report and summary do not share one artifact context');

  const sonarHomeCandidates = jobLinks.filter((url) =>
    url.origin === SAVED_SONAR_ORIGIN && isDashboardPath(url) &&
    exactlyOneQueryValue(url, 'id') !== undefined && url.searchParams.getAll('codeScope').length === 0);
  const savedSonarqubeHome = selectSingleUrl(sonarHomeCandidates, 'SonarQube home');
  const sonarqubeProjectId = projectIdFromSonarqubeUrl(parseCanonicalUrl(sonarqubeHomeRaw, 'SonarQube home'));
  if (exactlyOneQueryValue(savedSonarqubeHome, 'id') !== sonarqubeProjectId) {
    throw new Error('Template Jenkins and SonarQube project identities do not match');
  }
  const savedSonarqubeOverall = parseCanonicalUrl(sonarqubeOverallRaw, 'SonarQube Overall');
  if (savedSonarqubeOverall.origin !== SAVED_SONAR_ORIGIN || !isDashboardPath(savedSonarqubeOverall) ||
    exactlyOneQueryValue(savedSonarqubeOverall, 'id') !== sonarqubeProjectId ||
    exactlyOneQueryValue(savedSonarqubeOverall, 'codeScope') !== 'overall') {
    throw new Error('SonarQube Overall template identity is invalid');
  }
  const savedSonarqubeIssues = parseCanonicalUrl(sonarqubeIssuesRaw, 'SonarQube Issues');
  if (savedSonarqubeIssues.origin !== SAVED_SONAR_ORIGIN || !isProjectIssuesPath(savedSonarqubeIssues) ||
    exactlyOneQueryValue(savedSonarqubeIssues, 'id') !== sonarqubeProjectId) {
    throw new Error('SonarQube Issues template identity is invalid');
  }

  const projectName = env['PROJECT_NAME']?.trim() || 'Template reports';
  const jobUrl = remapOrigin(jenkinsCanonical, targetOrigin);
  const snykReportUrl = new URL(`artifact/${report.filename}`, jobUrl).toString();
  const snykSummaryUrl = new URL(`artifact/${summary.filename}`, jobUrl).toString();
  const sonarqubeHomeUrl = remapOrigin(savedSonarqubeHome, targetOrigin);
  const sonarqubeOverallUrl = remapOrigin(savedSonarqubeOverall, targetOrigin);
  const sonarqubeIssuesUrl = remapOrigin(savedSonarqubeIssues, targetOrigin);
  const sonarRoutes: SonarqubeRouteMap = {
    projectId: sonarqubeProjectId,
    homeUrl: sonarqubeHomeUrl,
    overallUrl: sonarqubeOverallUrl,
    issuesUrl: sonarqubeIssuesUrl,
  };
  const rewrittenJenkinsHtml = rewriteHrefAttributes(jenkinsHtmlRaw, jenkinsCanonical, (url) => {
    const reportLink = artifactLink(url, jenkinsCanonical.origin, report.filename);
    if (reportLink?.url.toString() === report.url.toString()) return snykReportUrl;
    const summaryLink = artifactLink(url, jenkinsCanonical.origin, summary.filename);
    if (summaryLink?.url.toString() === summary.url.toString()) return snykSummaryUrl;
    if (url.toString() === savedSonarqubeHome.toString()) return sonarqubeHomeUrl;
    return undefined;
  });
  return {
    loginUrl: remapOrigin(loginCanonical, targetOrigin),
    loginActionUrl: remapOrigin(loginAction, targetOrigin),
    jobUrl,
    snykReportUrl,
    snykSummaryUrl,
    sonarqubeHomeUrl,
    sonarqubeOverallUrl,
    sonarqubeIssuesUrl,
    loginHtml: rewriteFormAction(loginHtmlRaw, loginAction, remapOrigin(loginAction, targetOrigin)),
    jenkinsHtml: rewrittenJenkinsHtml,
    snykHtml,
    snykSummary,
    sonarqubeHomeHtml: rewriteSonarqubeLinks(sonarqubeHomeRaw, sonarRoutes, projectName),
    sonarqubeOverallHtml: rewriteSonarqubeLinks(sonarqubeOverallRaw, sonarRoutes, projectName),
    sonarqubeIssuesHtml: rewriteSonarqubeLinks(sonarqubeIssuesRaw, sonarRoutes, projectName),
    jenkinsTitle: decodeHtmlEntities(/<title[^>]*>([\s\S]*?)<\/title>/iu.exec(jenkinsHtmlRaw)?.[1]?.trim() ?? 'Jenkins template'),
    sonarqubeProjectId,
  };
}


export function templateResponse(url: URL, fixture: TemplateReportFixture): TemplateResponse | undefined {
  if (isExactFixtureUrl(url, fixture.loginUrl)) return { body: fixture.loginHtml, contentType: 'text/html; charset=utf-8' };
  if (isExactFixtureUrl(url, fixture.jobUrl)) return { body: fixture.jenkinsHtml, contentType: 'text/html; charset=utf-8' };
  if (isExactFixtureUrl(url, fixture.snykReportUrl)) return { body: fixture.snykHtml, contentType: 'text/html; charset=utf-8' };
  if (isExactFixtureUrl(url, fixture.snykSummaryUrl)) return { body: fixture.snykSummary, contentType: 'application/json; charset=utf-8' };
  if (isExactFixtureUrl(url, fixture.sonarqubeOverallUrl)) return { body: fixture.sonarqubeOverallHtml, contentType: 'text/html; charset=utf-8' };
  if (isExactFixtureUrl(url, fixture.sonarqubeHomeUrl)) return { body: fixture.sonarqubeHomeHtml, contentType: 'text/html; charset=utf-8' };
  if (isExactFixtureUrl(url, fixture.sonarqubeIssuesUrl)) return { body: fixture.sonarqubeIssuesHtml, contentType: 'text/html; charset=utf-8' };
  return undefined;
}

export async function installTemplateReportRoutes(
  context: BrowserContext,
  fixture: TemplateReportFixture,
): Promise<TemplateRouteRecorder> {
  const recorder: MutableTemplateRouteRecorder = { misses: [], truncated: false };
  const fixtureOrigin = new URL(fixture.jobUrl).origin;
  await context.route('**/*', async (route: Route) => {
    const request = route.request();
    let url: URL;
    try { url = new URL(request.url()); } catch {
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
    if (!['GET', 'HEAD'].includes(request.method())) {
      await abortTemplateRoute(route, recorder, 'blockedbyclient');
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


export function templateProjectDocument(
  env: NodeJS.ProcessEnv,
  fixture: TemplateReportFixture,
): ProjectConfigDocumentV1 {
  const projectId = env['PROJECT_ID']?.trim() || 'template-reports';
  const projectName = env['PROJECT_NAME']?.trim() || 'Template reports';
  const artifactDir = env['ARTIFACT_DIR']?.trim() || 'reports';
  const origin = new URL(fixture.jobUrl).origin;
  const timeoutMs = parsePositiveInteger(env['TEMPLATE_TIMEOUT_MS']?.trim() || '300000', 'TEMPLATE_TIMEOUT_MS');
  return {
    schemaVersion: 1,
    projects: [{
      id: projectId,
      name: projectName,
      enabled: true,
      loginUrl: fixture.loginUrl,
      jobUrl: fixture.jobUrl,
      timeoutMs,
      browser: parseBrowserName(env['PLAYWRIGHT_BROWSER']?.trim()),
      artifactDir,
      credentials: { usernameVariable: 'TEMPLATE_FIXTURE_USERNAME', passwordVariable: 'TEMPLATE_FIXTURE_PASSWORD' },
      sourceOrigins: { jenkins: [origin], snyk: [origin], sonarqube: [origin] },
      snyk: {
        allowedOrigins: [origin],
      },
      sonarqube: {
        allowedOrigins: [origin],
        projectId: fixture.sonarqubeProjectId,
      },
    }],
  };
}
