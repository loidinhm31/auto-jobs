import type { CaptureMetadata, SonarFacetValue, SonarSourceEvidence } from '../../result-types.js';
import { escapeHtmlAttribute, escapeHtmlText } from '../html-escape.js';
import { localArtifactHref, safeExternalHref } from '../report-links.js';
import { stateClass, stateLabel, type ProjectReportViewModel } from '../report-view-model.js';

function badge(state: SonarSourceEvidence['state']): string {
  return `<span class="state-badge ${escapeHtmlAttribute(stateClass(state))}">${escapeHtmlText(stateLabel(state))}</span>`;
}

function sourceAction(capture: CaptureMetadata | undefined): string {
  if (capture === undefined) return '';
  const href = safeExternalHref(capture.url);
  return href === undefined ? '' : `<a class="source-link" href="${escapeHtmlAttribute(href)}" target="_blank" rel="noopener noreferrer">Open validated source</a>`;
}

function evidenceImage(
  source: SonarSourceEvidence,
  filename: string,
  artifacts: readonly string[],
  alt: string,
): string {
  const capture = source.captures.find((item) => item.screenshotPath === filename && localArtifactHref(item.screenshotPath, artifacts) !== undefined);
  if (capture === undefined) return '<p class="empty-state">Screenshot evidence is unavailable.</p>';
  return `<figure class="evidence-figure"><img src="${escapeHtmlAttribute(filename)}" alt="${escapeHtmlAttribute(alt)}"><figcaption>${escapeHtmlText(alt)} captured at ${escapeHtmlText(capture.capturedAt)}. ${sourceAction(capture)}</figcaption></figure>`;
}

function facetTable(title: string, values: readonly SonarFacetValue[] | undefined): string {
  if (values === undefined) return `<p class="empty-state">No ${escapeHtmlText(title)} facet data was captured.</p>`;
  const rows = values.map((item) => `<tr><th scope="row">${escapeHtmlText(item.label)}</th><td>${item.count}</td></tr>`).join('');
  return `<table class="compact-table"><caption>SonarQube ${escapeHtmlText(title)} facets</caption><thead><tr><th scope="col">${escapeHtmlText(title)}</th><th scope="col">Count</th></tr></thead><tbody>${rows || '<tr><td colspan="2">No facet values captured.</td></tr>'}</tbody></table>`;
}

function homeSection(source: SonarSourceEvidence): string {
  const capture = source.captures.find((item) => !item.screenshotPath);
  const target = source.navigation.find((item) => item.key === 'sonarqube-home');
  const href = safeExternalHref(target?.liveUrl ?? capture?.url);
  const action = href === undefined ? '' : `<a class="source-link" href="${escapeHtmlAttribute(href)}" target="_blank" rel="noopener noreferrer">Open validated source</a>`;
  return `<section id="sonarqube-home" class="subsection" aria-labelledby="sonarqube-home-heading"><div class="section-heading"><h3 id="sonarqube-home-heading">SonarQube home</h3>${badge(target?.state ?? source.state)}</div><p>${href === undefined ? 'No validated SonarQube home URL was retained.' : `Validated source: ${action}`}</p></section>`;
}

export function renderSonarqubeSection(model: ProjectReportViewModel): string {
  const source = model.sonarqube;
  if (source === undefined) return `<section id="sonarqube-overall" aria-labelledby="sonarqube-heading"><h2 id="sonarqube-heading">SonarQube evidence</h2><p class="state-message">SonarQube evidence was not available for this failed run.</p><section id="sonarqube-issues" class="subsection" aria-labelledby="sonarqube-issues-heading"><h3 id="sonarqube-issues-heading">Issues</h3><p class="empty-state">No SonarQube Issues evidence was captured.</p></section></section>`;
  const overall = source.captures.find((item) => item.screenshotPath === 'sonarqube-overall.png');
  const issues = source.captures.find((item) => item.screenshotPath === 'sonarqube-issues.png');
  const overallTarget = source.navigation.find((item) => item.key === 'sonarqube-overall');
  const issuesTarget = source.navigation.find((item) => item.key === 'sonarqube-issues');
  return `<section id="sonarqube-overall" aria-labelledby="sonarqube-heading"><div class="section-heading"><div><p class="eyebrow">SonarQube</p><h2 id="sonarqube-heading">Overall and Issues evidence</h2></div>${badge(source.state)}</div>${homeSection(source)}<div class="subsection"><div class="section-heading"><h3>Overall</h3>${badge(overallTarget?.state ?? 'incomplete')}</div>${evidenceImage(source, 'sonarqube-overall.png', model.artifacts, 'SonarQube Overall evidence screenshot')} ${sourceAction(overall)}</div><section id="sonarqube-issues" class="subsection" aria-labelledby="sonarqube-issues-heading"><div class="section-heading"><h3 id="sonarqube-issues-heading">Issues</h3>${badge(issuesTarget?.state ?? 'incomplete')}</div>${evidenceImage(source, 'sonarqube-issues.png', model.artifacts, 'SonarQube Issues Type and Severity evidence screenshot')} ${sourceAction(issues)}<div class="facet-grid">${facetTable('Type', source.facets?.types)}${facetTable('Severity', source.facets?.severities)}</div></section>${source.warnings.length === 0 ? '' : `<ul class="warning-list">${source.warnings.map((warning) => `<li>${escapeHtmlText(warning)}</li>`).join('')}</ul>`}</section>`;
}
