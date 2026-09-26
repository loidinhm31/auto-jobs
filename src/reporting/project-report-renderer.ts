import { escapeHtmlAttribute, escapeHtmlText } from './html-escape.js';
import type { ProjectReportViewModel } from './report-view-model.js';
import { projectReportTitle, renderProjectReportBody } from './project-report-body-renderer.js';

export { projectReportTitle, renderProjectReportBody };
export const REPORT_CSP = "default-src 'none'; img-src 'self' data:; style-src 'self'; base-uri 'none'; form-action 'none'; object-src 'none'; frame-src 'none'";

export function renderProjectReport(model: ProjectReportViewModel): string {
  const title = projectReportTitle(model);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="${escapeHtmlAttribute(REPORT_CSP)}">
  <title>${escapeHtmlText(title)}</title>
  <link rel="stylesheet" href="../../assets/report.css">
</head>
<body>
${renderProjectReportBody(model)}
</body>
</html>
`;
}
