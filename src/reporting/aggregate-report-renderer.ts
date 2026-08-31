import type { AggregateProjectSummary, AggregateReportResult, AggregateRunSummary } from '../result-types.js';
import { escapeHtmlAttribute, escapeHtmlText } from './html-escape.js';
import { localManifestHref, localReportHref } from './report-links.js';
import { stateClass, stateLabel } from './report-view-model.js';
import { REPORT_CSP } from './project-report-renderer.js';

function stateBadge(state: AggregateProjectSummary['state']): string {
  return `<span class="state-badge ${escapeHtmlAttribute(stateClass(state))}">${escapeHtmlText(stateLabel(state))}</span>`;
}

function runLinks(run: AggregateRunSummary): string {
  const report = localReportHref(run.reportPath);
  const manifest = localManifestHref(run.manifestPath);
  const links = [
    report === undefined ? '' : `<a href="${escapeHtmlAttribute(report)}">Open report</a>`,
    manifest === undefined ? '' : `<a href="${escapeHtmlAttribute(manifest)}">Manifest</a>`,
  ].filter((value) => value.length > 0);
  return links.length === 0 ? '<span class="muted">No local artifact link</span>' : links.join(' · ');
}

function projectCard(project: AggregateProjectSummary): string {
  const currentHref = localReportHref(project.reportPath);
  const current = currentHref === undefined ? '' : `<p><a class="primary-link" href="${escapeHtmlAttribute(currentHref)}">Open current report</a></p>`;
  const runs = project.runs.length === 0
    ? '<p class="empty-state">No validated historical run manifest.</p>'
    : `<div class="table-scroll"><table class="compact-table"><caption>Historical runs for ${escapeHtmlText(project.name)}</caption><thead><tr><th scope="col">Run</th><th scope="col">State</th><th scope="col">Artifacts</th></tr></thead><tbody>${project.runs.map((run) => `<tr><th scope="row"><code>${escapeHtmlText(run.runId)}</code></th><td>${stateBadge(run.state)}</td><td>${runLinks(run)}${run.warnings.length === 0 ? '' : `<ul class="inline-warnings">${run.warnings.map((warning) => `<li>${escapeHtmlText(warning)}</li>`).join('')}</ul>`}</td></tr>`).join('')}</tbody></table></div>`;
  const warnings = project.warnings.length === 0 ? '' : `<ul class="warning-list">${project.warnings.map((warning) => `<li>${escapeHtmlText(warning)}</li>`).join('')}</ul>`;
  return `<section class="project-card" aria-labelledby="project-${escapeHtmlAttribute(project.projectId)}"><div class="section-heading"><div><p class="eyebrow">Project</p><h2 id="project-${escapeHtmlAttribute(project.projectId)}">${escapeHtmlText(project.name)} <code>${escapeHtmlText(project.projectId)}</code></h2></div>${stateBadge(project.state)}</div>${current}${runs}${warnings}</section>`;
}

function aggregateWarnings(warnings: readonly string[]): string {
  if (warnings.length === 0) return '';
  return `<section id="aggregate-warnings" aria-labelledby="aggregate-warnings-heading"><div class="section-heading"><h2 id="aggregate-warnings-heading">Aggregate warnings</h2><span class="state-badge state-incomplete">${warnings.length}</span></div><ul class="warning-list">${warnings.map((warning) => `<li>${escapeHtmlText(warning)}</li>`).join('')}</ul></section>`;
}

export function renderAggregateReport(aggregate: AggregateReportResult): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="${escapeHtmlAttribute(REPORT_CSP)}">
  <title>Vulnerability report index</title>
  <link rel="stylesheet" href="assets/report.css">
</head>
<body>
  <header class="report-header"><p class="eyebrow">Offline vulnerability evidence</p><h1>Vulnerability report index</h1><p class="lede">Generated ${escapeHtmlText(aggregate.generatedAt)} · ${aggregate.projects.length} configured project(s)</p></header>
  <main>${aggregateWarnings(aggregate.warnings)}${aggregate.projects.length === 0 ? '<p class="empty-state">No configured project outcomes were recorded.</p>' : aggregate.projects.map(projectCard).join('')}</main>
  <footer><p>Aggregate history is built only from validated schema-v3 manifests. Missing or invalid entries are omitted and surfaced as warnings.</p></footer>
</body>
</html>
`;
}
