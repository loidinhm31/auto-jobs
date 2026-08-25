import type { CaptureMetadata, SnykFinding, SnykSourceEvidence } from '../../result-types.js';
import { escapeHtmlAttribute, escapeHtmlText } from '../html-escape.js';
import { localArtifactHref, safeExternalHref } from '../report-links.js';
import { stateClass, stateLabel, type ProjectReportViewModel } from '../report-view-model.js';

function badge(state: SnykSourceEvidence['state']): string {
  return `<span class="state-badge ${escapeHtmlAttribute(stateClass(state))}">${escapeHtmlText(stateLabel(state))}</span>`;
}

function sourceLine(capture: CaptureMetadata): string {
  const href = safeExternalHref(capture.url);
  const url = href === undefined ? escapeHtmlText(capture.url) : `<a href="${escapeHtmlAttribute(href)}" target="_blank" rel="noopener noreferrer">${escapeHtmlText(href)}</a>`;
  return `<li>${url}${capture.title === undefined ? '' : ` — ${escapeHtmlText(capture.title)}`}</li>`;
}

function screenshot(source: SnykSourceEvidence, artifacts: readonly string[]): string {
  const capture = source.captures.find((item) => localArtifactHref(item.screenshotPath, artifacts) !== undefined);
  if (capture === undefined) return '<p class="empty-state">No Snyk screenshot was captured.</p>';
  const href = localArtifactHref(capture.screenshotPath, artifacts);
  return href === undefined ? '<p class="empty-state">Snyk screenshot evidence is unavailable.</p>' : `<figure class="evidence-figure"><img src="${escapeHtmlAttribute(href)}" alt="Snyk test report evidence screenshot"><figcaption>Snyk test report screenshot captured at ${escapeHtmlText(capture.capturedAt)}.</figcaption></figure>`;
}

function summary(source: SnykSourceEvidence): string {
  if (source.summary === undefined) return '<p class="empty-state">No normalized Snyk summary was captured.</p>';
  const counts = source.summary.counts;
  const rows = (['critical', 'high', 'medium', 'low'] as const).map((severity) => `<tr><th scope="row">${severity}</th><td>${counts[severity]}</td></tr>`);
  const metadata = source.summary.metadata === undefined ? '' : `<p class="muted">${escapeHtmlText(source.summary.metadata.project ?? 'Project metadata captured')}${source.summary.metadata.packageManager === undefined ? '' : ` · ${escapeHtmlText(source.summary.metadata.packageManager)}`}</p>`;
  const detail = source.summary.detail;
  return `<table class="compact-table"><caption>Snyk severity totals</caption><thead><tr><th scope="col">Severity</th><th scope="col">Count</th></tr></thead><tbody>${rows.join('')}</tbody></table>${metadata}<p class="muted">${detail.retainedCount} detailed finding(s) retained of ${detail.totalObserved} observed${detail.truncated ? `; ${detail.omittedCount} omitted by the evidence cap.` : '.'}</p>`;
}

function values(values: readonly string[] | undefined): string {
  return values === undefined || values.length === 0 ? '—' : values.map((value) => escapeHtmlText(value)).join('<br>');
}

function references(values: readonly string[] | undefined): string {
  if (values === undefined || values.length === 0) return '—';
  return values.map((value) => {
    const href = safeExternalHref(value);
    return href === undefined ? escapeHtmlText(value) : `<a href="${escapeHtmlAttribute(href)}" target="_blank" rel="noopener noreferrer">${escapeHtmlText(href)}</a>`;
  }).join('<br>');
}

function findingRow(finding: SnykFinding): string {
  return `<tr><td>${escapeHtmlText(finding.id ?? '—')}</td><td>${escapeHtmlText(finding.title ?? '—')}</td><td><span class="severity severity-${escapeHtmlAttribute(finding.severity)}">${escapeHtmlText(finding.severity)}</span></td><td>${escapeHtmlText(finding.module ?? '—')}</td><td>${escapeHtmlText(finding.remediation ?? '—')}</td><td>${values(finding.paths)}</td><td>${references(finding.references)}</td></tr>`;
}

function findings(source: SnykSourceEvidence): string {
  const items = source.findings ?? [];
  if (items.length === 0) return '<p class="empty-state">No detailed findings were captured; summary-only evidence may still be available.</p>';
  return `<div class="table-scroll"><table class="findings-table"><caption>Retained Snyk detailed findings</caption><thead><tr><th scope="col">ID</th><th scope="col">Title</th><th scope="col">Severity</th><th scope="col">Module</th><th scope="col">Remediation</th><th scope="col">Paths</th><th scope="col">References</th></tr></thead><tbody>${items.map(findingRow).join('')}</tbody></table></div>`;
}

export function renderSnykSection(model: ProjectReportViewModel): string {
  const source = model.snyk;
  if (source === undefined) return `<section id="snyk-test-report" aria-labelledby="snyk-heading"><h2 id="snyk-heading">Snyk test report</h2><p class="state-message">Snyk evidence was not available for this failed run.</p></section>`;
  return `<section id="snyk-test-report" aria-labelledby="snyk-heading"><div class="section-heading"><div><p class="eyebrow">Snyk</p><h2 id="snyk-heading">Snyk test report</h2></div>${badge(source.state)}</div><p class="state-message">${source.state === 'found' ? 'Normalized evidence captured.' : source.state === 'not_found' ? 'No Snyk report link was found in the terminal build.' : 'Snyk evidence is incomplete; warnings explain what was retained.'}</p>${screenshot(source, model.artifacts)}${summary(source)}<h3>Detailed findings</h3>${findings(source)}${source.captures.length === 0 ? '' : `<h3>Capture provenance</h3><ul class="provenance-list">${source.captures.map(sourceLine).join('')}</ul>`}${source.warnings.length === 0 ? '' : `<ul class="warning-list">${source.warnings.map((warning) => `<li>${escapeHtmlText(warning)}</li>`).join('')}</ul>`}</section>`;
}
