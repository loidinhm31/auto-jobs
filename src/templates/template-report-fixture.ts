import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { BrowserContext, Route } from '@playwright/test';

import type { ProjectConfigDocumentV1 } from '../config/config-types.js';
import { parseBrowserName, parsePositiveInteger } from '../config-values.js';
import type { ProjectWorkflow } from '../project/project-workflow.js';

export const TEMPLATE_REPORT_ORIGIN = 'https://templates.invalid';
const SAVED_SONAR_ORIGIN = 'https://sonarqube.example-domain.com';
const MAX_TEMPLATE_BYTES = 4 * 1_048_576;
const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export interface TemplateReportFixture {
  readonly buildNumber: number;
  readonly terminalUrl: string;
  readonly snykReportUrl: string;
  readonly snykSummaryUrl: string;
  readonly sonarqubeHomeUrl: string;
  readonly sonarqubeOverallUrl: string;
  readonly sonarqubeIssuesUrl: string;
  readonly snykHtml: string;
  readonly snykSummary: string;
  readonly sonarqubeHomeHtml: string;
  readonly sonarqubeOverallHtml: string;
  readonly sonarqubeIssuesHtml: string;
  readonly jenkinsTitle: string;
  readonly sonarqubeProjectId: string;
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function encoded(value: string): string {
  return encodeURIComponent(value);
}

function escapedPattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

async function descriptorPath(fileDescriptor: number): Promise<string> {
  return fs.realpath(path.join('/proc/self/fd', String(fileDescriptor)));
}

interface FileIdentity {
  readonly dev: number;
  readonly ino: number;
}

function sameIdentity(left: FileIdentity, right: FileIdentity): boolean {
  return left.dev === right.dev && left.ino === right.ino;
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
      if (pathStat.dev !== handleStat.dev || pathStat.ino !== handleStat.ino) return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function readTemplate(root: string, relativePath: string, expectedRootIdentity: FileIdentity): Promise<string> {
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
      if (!stat.isFile() || stat.size > MAX_TEMPLATE_BYTES) {
        throw new Error(`Template source is not a regular file under ${MAX_TEMPLATE_BYTES} bytes: ${relativePath}`);
      }
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

function projectIdFromSonarqubeHtml(html: string): string {
  const match = new RegExp(`${SAVED_SONAR_ORIGIN.replaceAll('.', '\\.')}/dashboard\\?id=([^&"']+)`, 'u').exec(html);
  if (match?.[1] === undefined) throw new Error('SonarQube template does not contain a project dashboard identity');
  let projectId: string;
  try { projectId = decodeURIComponent(match[1]); } catch { throw new Error('SonarQube template project identity is malformed'); }
  if (projectId.length === 0 || projectId.length > 512) throw new Error('SonarQube template project identity is unsafe');
  return projectId;
}

function rewriteSonarqubeLinks(html: string, projectId: string, origin: string, projectName: string): string {
  const encodedProjectId = encoded(projectId);
  const rewritten = html.replace(/href="([^"]*)"/gu, (whole, rawHref: string) => {
    let url: URL;
    try { url = new URL(rawHref.replaceAll('&amp;', '&')); } catch { return whole; }
    if (url.origin !== SAVED_SONAR_ORIGIN) return whole;
    const pathname = url.pathname.replace(/\/+$/u, '').toLowerCase();
    if (pathname.endsWith('/dashboard')) {
      const scope = url.searchParams.get('codeScope');
      const target = `${origin}/dashboard?id=${encodedProjectId}${scope === 'overall' ? '&codeScope=overall' : ''}`;
      return `href="${target}"`;
    }
    if (pathname === '/issues' || pathname.endsWith('/issues')) {
      return `href="${origin}/project/issues?issueStatuses=OPEN%2CCONFIRMED&id=${encodedProjectId}"`;
    }
    return whole;
  });
  const overallUrl = `${origin}/dashboard?id=${encodedProjectId}&codeScope=overall`;
  const withOverallLink = rewritten.replace(
    /<button([^>]*\brole="tab"[^>]*)>\s*Overall Code\s*<\/button>/giu,
    `<a$1 href="${overallUrl}">Overall Code</a>`,
  );
  const sourceDisplayName = projectId.slice(projectId.lastIndexOf(':') + 1);
  if (sourceDisplayName === projectName) return withOverallLink;
  return withOverallLink.replace(
    new RegExp(`(<a[^>]*\\bjs-project-link\\b[^>]*>\\s*)${escapedPattern(sourceDisplayName)}(\\s*<\\/a>)`, 'u'),
    (_whole, prefix: string, suffix: string) => `${prefix}${escapeHtml(projectName)}${suffix}`,
  );
}

export async function loadTemplateReportFixture(
  env: NodeJS.ProcessEnv,
  buildNumber: number,
  origin = TEMPLATE_REPORT_ORIGIN,
): Promise<TemplateReportFixture> {
  const configuredRoot = env['TEMPLATES_DIR']?.trim() || path.join(REPOSITORY_ROOT, 'templates');
  const configuredRootPath = path.resolve(configuredRoot);
  const rootStat = await fs.lstat(configuredRootPath);
  const canonicalRoot = await fs.realpath(configuredRootPath);
  const rootIsSafe = process.platform === 'win32'
    ? await windowsPathIsSafe(canonicalRoot, configuredRootPath)
    : canonicalRoot === configuredRootPath;
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink() || !rootIsSafe) {
    throw new Error('Template root must be a real directory without symbolic-link components');
  }
  const root = canonicalRoot;
  const rootIdentity = { dev: rootStat.dev, ino: rootStat.ino };
  const jenkinsHtml = await readTemplate(root, 'jenkins-template/template.html', rootIdentity);
  const snykHtml = await readTemplate(root, 'snyk-template/template.html', rootIdentity);
  const snykSummary = await readTemplate(root, 'snyk-template/snyk-sca-results-summary.json', rootIdentity);
  const sonarqubeHomeRaw = await readTemplate(root, 'sonarqube-template/template-home.html', rootIdentity);
  const sonarqubeOverallRaw = await readTemplate(root, 'sonarqube-template/template-overall.html', rootIdentity);
  const sonarqubeIssuesRaw = await readTemplate(root, 'sonarqube-template/template-issues.html', rootIdentity);
  const projectName = env['PROJECT_NAME']?.trim() || 'Template reports';
  const sonarqubeProjectId = projectIdFromSonarqubeHtml(sonarqubeHomeRaw);
  const terminalPath = `/job/template-report/${buildNumber}/`;
  const snykPath = `${terminalPath}artifact/reports/snyk/index.html`;
  const summaryPath = `${terminalPath}artifact/reports/snyk/report.json`;
  const homePath = `/dashboard?id=${encoded(sonarqubeProjectId)}`;
  return {
    buildNumber,
    terminalUrl: `${origin}${terminalPath}`,
    snykReportUrl: `${origin}${snykPath}`,
    snykSummaryUrl: `${origin}${summaryPath}`,
    sonarqubeHomeUrl: `${origin}${homePath}`,
    sonarqubeOverallUrl: `${origin}/dashboard?id=${encoded(sonarqubeProjectId)}&codeScope=overall`,
    sonarqubeIssuesUrl: `${origin}/project/issues?issueStatuses=OPEN%2CCONFIRMED&id=${encoded(sonarqubeProjectId)}`,
    snykHtml,
    snykSummary,
    sonarqubeHomeHtml: rewriteSonarqubeLinks(sonarqubeHomeRaw, sonarqubeProjectId, origin, projectName),
    sonarqubeOverallHtml: rewriteSonarqubeLinks(sonarqubeOverallRaw, sonarqubeProjectId, origin, projectName),
    sonarqubeIssuesHtml: rewriteSonarqubeLinks(sonarqubeIssuesRaw, sonarqubeProjectId, origin, projectName),
    jenkinsTitle: /<title[^>]*>([^<]*)<\/title>/iu.exec(jenkinsHtml)?.[1]?.trim() || 'Jenkins template',
    sonarqubeProjectId,
  };
}

function terminalHtml(fixture: TemplateReportFixture): string {
  return `<!doctype html><html><head><title>${escapeHtml(fixture.jenkinsTitle)} — template report</title></head><body>
    <main><h1>Template-backed vulnerability report</h1>
      <p>Checked-in Jenkins, Snyk, and SonarQube snapshots are the report source.</p>
      <a data-testid="snyk-report" href="${fixture.snykReportUrl}">Snyk test report</a>
      <a href="${fixture.snykSummaryUrl}">Snyk summary JSON</a>
      <a data-testid="sonarqube-report" href="${fixture.sonarqubeHomeUrl}">SonarQube Quality Gate</a>
    </main>
  </body></html>`;
}

export function templateResponse(url: URL, fixture: TemplateReportFixture): { body: string; contentType: string } | undefined {
  if (url.pathname === new URL(fixture.terminalUrl).pathname) return { body: terminalHtml(fixture), contentType: 'text/html; charset=utf-8' };
  if (url.pathname === new URL(fixture.snykReportUrl).pathname) return { body: fixture.snykHtml, contentType: 'text/html; charset=utf-8' };
  if (url.pathname === new URL(fixture.snykSummaryUrl).pathname) return { body: fixture.snykSummary, contentType: 'application/json; charset=utf-8' };
  if (url.pathname === '/dashboard') {
    return url.searchParams.get('codeScope') === 'overall'
      ? { body: fixture.sonarqubeOverallHtml, contentType: 'text/html; charset=utf-8' }
      : { body: fixture.sonarqubeHomeHtml, contentType: 'text/html; charset=utf-8' };
  }
  if (url.pathname === '/project/issues') return { body: fixture.sonarqubeIssuesHtml, contentType: 'text/html; charset=utf-8' };
  return undefined;
}

export async function installTemplateReportRoutes(
  context: BrowserContext,
  fixture: TemplateReportFixture,
): Promise<void> {
  await context.route('**/*', async (route: Route) => {
    if (!['GET', 'HEAD'].includes(route.request().method())) { await route.abort('blockedbyclient'); return; }
    let url: URL;
    try { url = new URL(route.request().url()); } catch { await route.abort(); return; }
    if (url.origin !== new URL(fixture.terminalUrl).origin) { await route.abort(); return; }
    const response = templateResponse(url, fixture);
    if (response === undefined) {
      await route.fulfill({
        status: 404,
        contentType: 'text/plain; charset=utf-8',
        body: 'template route not found',
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: response.contentType, body: response.body });
  });
}

export function templateWorkflow(fixture: TemplateReportFixture): ProjectWorkflow {
  return async (page, _project, _secrets, deadline, state) => {
    await installTemplateReportRoutes(page.context(), fixture);
    const build = { number: fixture.buildNumber, url: fixture.terminalUrl };
    state.transition('authenticated');
    state.transition('job_resolved');
    state.transition('existing_build_selected');
    state.bindBuild(build);
    state.transition('running');
    await page.goto(fixture.terminalUrl, { waitUntil: 'domcontentloaded', timeout: deadline.requireRemaining() });
    state.transition('terminal');
    return {
      terminal: { build, status: 'TEMPLATE', observedAt: new Date().toISOString(), observationErrors: [], reloadCount: 0 },
      trigger: { capability: 'unknown', triggerAttempts: 0, build, warnings: [] },
      diagnostics: { lastSafeUrl: fixture.terminalUrl, status: 'TEMPLATE', observationErrors: [], reloadCount: 0 },
    };
  };
}

export function templateProjectDocument(
  env: NodeJS.ProcessEnv,
  fixture: TemplateReportFixture,
): ProjectConfigDocumentV1 {
  const projectId = env['PROJECT_ID']?.trim() || 'template-reports';
  const projectName = env['PROJECT_NAME']?.trim() || 'Template reports';
  const artifactDir = env['ARTIFACT_DIR']?.trim() || 'reports';
  const origin = new URL(fixture.terminalUrl).origin;
  const timeoutMs = parsePositiveInteger(env['TEMPLATE_TIMEOUT_MS']?.trim() || '300000', 'TEMPLATE_TIMEOUT_MS');
  return {
    schemaVersion: 1,
    projects: [{
      id: projectId,
      name: projectName,
      enabled: true,
      loginUrl: `${origin}/login`,
      jobUrl: fixture.terminalUrl,
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
