import { escapeHtmlAttribute, escapeHtmlText } from '../html-escape.js';
import { localArtifactHref } from '../report-links.js';
import { REPORT_ANCHORS, type ProjectReportViewModel } from '../report-view-model.js';

function artifactLink(filename: string, artifacts: readonly string[]): string {
  const href = localArtifactHref(filename, artifacts);
  return href === undefined
    ? `<span>${escapeHtmlText(filename)} (not available)</span>`
    : `<a href="${escapeHtmlAttribute(href)}">${escapeHtmlText(filename)}</a>`;
}

function warningList(values: readonly string[]): string {
  return values.length === 0
    ? '<p class="empty-state">No warnings recorded.</p>'
    : `<ul class="warning-list">${values.map((value) => `<li>${escapeHtmlText(value)}</li>`).join('')}</ul>`;
}

export function renderArtifactSection(model: ProjectReportViewModel): string {
  const files = ['data.json', 'manifest.json', ...model.artifacts];
  if (model.trace !== undefined) files.push(model.trace);
  const diagnostic = model.diagnostic === undefined ? '' : `<div class="diagnostic"><h3>Diagnostic</h3><p>${escapeHtmlText(model.diagnostic)}</p></div>`;
  return `<section id="artifacts" aria-labelledby="artifacts-heading">
    <div class="section-heading"><div><p class="eyebrow">Evidence</p><h2 id="artifacts-heading">Artifacts and warnings</h2></div><a href="${escapeHtmlAttribute(REPORT_ANCHORS['jenkins-build'])}">Back to Jenkins</a></div>
    <h3>Run files</h3><ul class="artifact-list">${files.map((file) => `<li>${artifactLink(file, [...files])}</li>`).join('')}</ul>
    ${diagnostic}<h3>Warnings</h3>${warningList(model.warnings)}
    <p class="security-note">When served over HTTP, add a response-header CSP with <code>frame-ancestors 'none'</code>; a meta policy cannot enforce that directive.</p>
  </section>`;
}
