import { escapeHtmlAttribute, escapeHtmlText } from '../html-escape.js';
import { localAnchorHref, safeExternalHref } from '../report-links.js';
import { REPORT_ANCHORS, stateClass, stateLabel, type ProjectReportViewModel } from '../report-view-model.js';

const NAVIGATION_LABELS: Readonly<Record<string, string>> = {
  'jenkins-build': 'Jenkins build',
  'snyk-report': 'Snyk test report',
  'sonarqube-home': 'SonarQube home',
  'sonarqube-overall': 'SonarQube Overall',
  'sonarqube-issues': 'SonarQube Issues',
};

function stateBadge(state: string): string {
  return `<span class="state-badge ${escapeHtmlAttribute(stateClass(state as Parameters<typeof stateClass>[0]))}">${escapeHtmlText(stateLabel(state as Parameters<typeof stateLabel>[0]))}</span>`;
}

function externalAction(url: string | undefined): string {
  const safe = safeExternalHref(url);
  return safe === undefined
    ? ''
    : ` <a class="source-link" href="${escapeHtmlAttribute(safe)}" target="_blank" rel="noopener noreferrer">Open validated source</a>`;
}

function navigationLinks(model: ProjectReportViewModel): string {
  const links = model.navigation.map((target) => {
    const anchor = localAnchorHref(target.localAnchor) ?? REPORT_ANCHORS[target.key];
    return `<li><a href="${escapeHtmlAttribute(anchor)}">${escapeHtmlText(NAVIGATION_LABELS[target.key] ?? target.key)}</a> ${stateBadge(target.state)}${externalAction(target.liveUrl)}</li>`;
  });
  links.push(`<li><a href="${escapeHtmlAttribute(REPORT_ANCHORS.artifacts)}">Artifacts and warnings</a></li>`);
  return `<ul class="navigation-list">${links.join('')}</ul>`;
}

export function renderJenkinsSection(model: ProjectReportViewModel): string {
  const jenkins = model.jenkins;
  const build = jenkins === undefined
    ? '<p class="state-message">No terminal Jenkins build identity was captured.</p>'
    : `<dl class="metadata-grid">
      <div><dt>Job path</dt><dd>${escapeHtmlText(jenkins.jobPath)}</dd></div>
      <div><dt>Build</dt><dd>#${jenkins.buildNumber}</dd></div>
      <div><dt>Status</dt><dd>${escapeHtmlText(jenkins.status)}</dd></div>
      <div><dt>Observed</dt><dd>${escapeHtmlText(model.run.observedAt)}</dd></div>
      <div><dt>Trigger</dt><dd>${escapeHtmlText(jenkins.trigger.capability)} (${jenkins.trigger.triggerAttempts} attempt(s))</dd></div>
    </dl>
    <p class="source-line">Build URL: ${externalAction(jenkins.buildUrl) || escapeHtmlText(jenkins.buildUrl)}</p>`;
  return `<section id="jenkins" aria-labelledby="jenkins-heading">
    <div class="section-heading"><div><p class="eyebrow">Jenkins</p><h2 id="jenkins-heading">Build and navigation</h2></div>${stateBadge(model.state)}</div>
    ${build}
    <nav aria-label="Report sections"><h3>Evidence navigation</h3>${navigationLinks(model)}</nav>
  </section>`;
}
