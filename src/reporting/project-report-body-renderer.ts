import { escapeHtmlAttribute, escapeHtmlText } from './html-escape.js';
import { REPORT_ANCHORS, stateClass, stateLabel, type ProjectReportViewModel } from './report-view-model.js';
import { renderArtifactSection } from './sections/artifact-section.js';
import { renderJenkinsSection } from './sections/jenkins-section.js';
import { renderSnykSection } from './sections/snyk-section.js';
import { renderSonarqubeSection } from './sections/sonarqube-section.js';

export function projectReportTitle(model: ProjectReportViewModel): string {
  return `${model.project.name} vulnerability report`;
}

function stateBadge(state: ProjectReportViewModel['state']): string {
  return `<span class="state-badge ${escapeHtmlAttribute(stateClass(state))}">${escapeHtmlText(stateLabel(state))}</span>`;
}

function navigationSummary(model: ProjectReportViewModel): string {
  return model.navigation.map((target) => `<a href="${escapeHtmlAttribute(target.localAnchor)}">${escapeHtmlText(target.key)}</a>`).join(' · ');
}

export function renderProjectReportBody(model: ProjectReportViewModel): string {
  const title = projectReportTitle(model);
  return `  <header class="report-header">
    <p class="eyebrow">Offline vulnerability evidence</p>
    <h1>${escapeHtmlText(title)}</h1>
    <p class="lede">Project <code>${escapeHtmlText(model.project.id)}</code> · run <code>${escapeHtmlText(model.run.runId)}</code> · ${stateBadge(model.state)}</p>
    <p class="quick-links">${navigationSummary(model)} · <a href="${escapeHtmlAttribute(REPORT_ANCHORS.artifacts)}">artifacts</a></p>
  </header>
  <main>
    ${renderJenkinsSection(model)}
    ${renderSnykSection(model)}
    ${renderSonarqubeSection(model)}
    ${renderArtifactSection(model)}
  </main>
  <footer><p>Generated from normalized schema-v3 evidence. No vendor HTML or executable resources are embedded.</p></footer>`;
}
