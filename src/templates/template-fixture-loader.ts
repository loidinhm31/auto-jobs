import {
  extractSidePanelBuildLink,
  validateBuildTemplate,
} from './template-fixture-build-validation.js';
import {
  readTemplate,
  resolveTemplateRoot,
} from './template-fixture-file-io.js';
import {
  anchorUrls,
  artifactLink,
  attribute,
  decodeHtmlEntities,
  elementTags,
  exactlyOneQueryValue,
  parseAbsoluteUrl,
  parseCanonicalUrl,
  remapOrigin,
  rewriteFormAction,
  rewriteHrefAttributes,
  rewriteSonarqubeLoginForm,
  selectArtifactLink,
  selectSingleUrl,
} from './template-fixture-html.js';
import {
  isDashboardPath,
  isProjectIssuesPath,
  projectIdFromSonarqubeUrl,
  rewriteSonarqubeLinks,
  SAVED_SONAR_ORIGIN,
} from './template-fixture-sonarqube.js';
import type {
  SonarqubeRouteMap,
  TemplateReadBudget,
  TemplateReportFixture,
} from './template-fixture-types.js';

export const TEMPLATE_REPORT_ORIGIN = 'https://templates.invalid';
const TEMPLATE_JENKINS_JOB_ORIGIN = 'https://jenkins-example.example-domain.com';
const TEMPLATE_JENKINS_LOGIN_ORIGIN = 'https://jenkins-jenkins-example.example-domain.com';

export async function loadTemplateReportFixture(
  env: NodeJS.ProcessEnv,
  origin = TEMPLATE_REPORT_ORIGIN,
): Promise<TemplateReportFixture> {
  const targetOrigin = new URL(origin).origin;
  const { root, rootIdentity } = await resolveTemplateRoot(env);
  const budget: TemplateReadBudget = { bytes: 0 };
  const jenkinsHtmlRaw = await readTemplate(root, 'jenkins-template/template.html', rootIdentity, budget);
  const loginHtmlRaw = await readTemplate(root, 'jenkins-template/login.html', rootIdentity, budget);
  const templateBuildRaw = await readTemplate(root, 'jenkins-template/template-build.html', rootIdentity, budget);
  const snykHtml = await readTemplate(root, 'snyk-template/template.html', rootIdentity, budget);
  const snykSummary = await readTemplate(root, 'snyk-template/snyk-sca-results-summary.json', rootIdentity, budget);
  const sonarqubeHomeRaw = await readTemplate(root, 'sonarqube-template/template-home.html', rootIdentity, budget);
  const sonarqubeLoginRaw = await readTemplate(root, 'sonarqube-template/template-login.html', rootIdentity, budget);
  const sonarqubeOverallRaw = await readTemplate(root, 'sonarqube-template/template-overall.html', rootIdentity, budget);
  const sonarqubeIssuesRaw = await readTemplate(root, 'sonarqube-template/template-issues.html', rootIdentity, budget);

  const jenkinsCanonical = parseCanonicalUrl(jenkinsHtmlRaw, 'Jenkins job');
  if (jenkinsCanonical.origin !== TEMPLATE_JENKINS_JOB_ORIGIN) {
    throw new Error('Jenkins job template origin is not the approved saved origin');
  }
  const loginCanonical = parseCanonicalUrl(loginHtmlRaw, 'Jenkins login');
  if (loginCanonical.origin !== TEMPLATE_JENKINS_LOGIN_ORIGIN) {
    throw new Error('Jenkins login template origin is not the approved saved origin');
  }
  const postForms = elementTags(loginHtmlRaw, 'form').filter((t) => (attribute(t, 'method') ?? 'get').trim().toLowerCase() === 'post');
  if (postForms.length !== 1) throw new Error('Template login must contain exactly one POST form');
  const rawAction = attribute(postForms[0]!, 'action');
  if (rawAction === undefined) throw new Error('Template login POST form action is missing');
  const loginAction = parseAbsoluteUrl(rawAction, loginCanonical, 'login action');
  if (loginAction.origin !== loginCanonical.origin) throw new Error('Template login action changed origin');

  const savedBuildUrl = extractSidePanelBuildLink(jenkinsHtmlRaw, jenkinsCanonical);
  const { buildAction } = validateBuildTemplate(templateBuildRaw, savedBuildUrl);

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
  const savedSonarqubeLogin = parseCanonicalUrl(sonarqubeLoginRaw, 'SonarQube login');
  if (savedSonarqubeLogin.origin !== SAVED_SONAR_ORIGIN || savedSonarqubeLogin.pathname !== '/sessions/new') {
    throw new Error('SonarQube login template identity is invalid');
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
  const buildPageUrl = remapOrigin(savedBuildUrl, targetOrigin);
  const buildActionUrl = remapOrigin(buildAction, targetOrigin);
  const snykReportUrl = new URL(`artifact/${report.filename}`, jobUrl).toString();
  const snykSummaryUrl = new URL(`artifact/${summary.filename}`, jobUrl).toString();
  const sonarqubeLoginUrl = remapOrigin(savedSonarqubeLogin, targetOrigin);
  const sonarqubeLoginActionUrl = new URL('/sessions/new', targetOrigin).toString();
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
    if (url.toString() === savedBuildUrl.toString()) return buildPageUrl;
    return undefined;
  });

  return {
    loginUrl: remapOrigin(loginCanonical, targetOrigin),
    loginActionUrl: remapOrigin(loginAction, targetOrigin),
    jobUrl,
    buildPageUrl,
    buildActionUrl,
    snykReportUrl,
    snykSummaryUrl,
    sonarqubeLoginUrl,
    sonarqubeLoginActionUrl,
    sonarqubeHomeUrl,
    sonarqubeOverallUrl,
    sonarqubeIssuesUrl,
    loginHtml: rewriteFormAction(loginHtmlRaw, loginAction, remapOrigin(loginAction, targetOrigin)),
    jenkinsHtml: rewrittenJenkinsHtml,
    buildHtml: rewriteFormAction(templateBuildRaw, buildAction, buildActionUrl, 'Jenkins build form'),
    snykHtml,
    snykSummary,
    sonarqubeLoginHtml: rewriteSonarqubeLoginForm(sonarqubeLoginRaw, sonarqubeLoginActionUrl),
    sonarqubeHomeHtml: rewriteSonarqubeLinks(sonarqubeHomeRaw, sonarRoutes, projectName),
    sonarqubeOverallHtml: rewriteSonarqubeLinks(sonarqubeOverallRaw, sonarRoutes, projectName),
    sonarqubeIssuesHtml: rewriteSonarqubeLinks(sonarqubeIssuesRaw, sonarRoutes, projectName),
    jenkinsTitle: decodeHtmlEntities(/<title[^>]*>([\s\S]*?)<\/title>/iu.exec(jenkinsHtmlRaw)?.[1]?.trim() ?? 'Jenkins template'),
    sonarqubeProjectId,
  };
}
