import { escapeHtmlAttribute, escapeHtmlText } from './html-escape.js';
import { REPORT_ANCHORS, stateClass, stateLabel, type ProjectReportViewModel } from './report-view-model.js';
import { renderArtifactSection } from './sections/artifact-section.js';
import { renderJenkinsSection } from './sections/jenkins-section.js';
import { renderSnykSection } from './sections/snyk-section.js';
import { renderSonarqubeSection } from './sections/sonarqube-section.js';

export const REPORT_CSP = "default-src 'none'; img-src 'self' data:; style-src 'self'; base-uri 'none'; form-action 'none'; object-src 'none'; frame-src 'none'";

function stateBadge(state: ProjectReportViewModel['state']): string {
  return `<span class="state-badge ${escapeHtmlAttribute(stateClass(state))}">${escapeHtmlText(stateLabel(state))}</span>`;
}

function navigationSummary(model: ProjectReportViewModel): string {
  return model.navigation.map((target) => `<a href="${escapeHtmlAttribute(target.localAnchor)}">${escapeHtmlText(target.key)}</a>`).join(' · ');
}

export function renderProjectReport(model: ProjectReportViewModel): string {
  const title = `${model.project.name} vulnerability report`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="${escapeHtmlAttribute(REPORT_CSP)}">
  <title>${escapeHtmlText(title)}</title>
  <link rel="stylesheet" href="../../../assets/report.css">
</head>
<body>
  <header class="report-header">
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
  <footer><p>Generated from normalized schema-v2 evidence. No vendor HTML or executable resources are embedded.</p></footer>
</body>
</html>
`;
}
