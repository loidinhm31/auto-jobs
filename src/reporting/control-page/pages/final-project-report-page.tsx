import { useEffect, useMemo } from 'react';
import { parseProjectReportRoute } from '../../project-report-route.js';
import {
  projectReportTitle,
  renderProjectReportBody,
} from '../../project-report-body-renderer.js';
import { useProjectReport } from '../hooks/use-project-report.js';
import { ProjectReportStatusView } from '../components/molecules/ProjectReportStatusView.js';
import { ReportExportButton } from '../components/molecules/ReportExportButton.js';
import { FinalReportLayout } from '../components/templates/FinalReportLayout.js';

export function FinalProjectReportPage() {
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
  const routeMatch = useMemo(() => parseProjectReportRoute(pathname), [pathname]);

  const projectId = routeMatch?.projectId;
  const runId = routeMatch?.runId;

  const { state, reload } = useProjectReport(projectId, runId);

  // Dynamically load the scoped report.css stylesheet on mount
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const linkId = 'report-stylesheet-link';
    let link = document.getElementById(linkId) as HTMLLinkElement | null;
    let created = false;
    if (!link) {
      link = document.createElement('link');
      link.id = linkId;
      link.rel = 'stylesheet';
      link.href = '/reports/assets/report.css';
      document.head.appendChild(link);
      created = true;
    }
    return () => {
      if (created && link && link.parentNode) {
        link.parentNode.removeChild(link);
      }
    };
  }, []);

  // Update document title based on viewer lifecycle status
  useEffect(() => {
    if (typeof document === 'undefined') return;
    switch (state.status) {
      case 'ready':
        document.title = projectReportTitle(state.model);
        break;
      case 'loading':
        document.title = 'Loading vulnerability report...';
        break;
      case 'missing':
        document.title = 'Vulnerability report not found';
        break;
      case 'invalid':
        document.title = 'Invalid vulnerability report';
        break;
      case 'load-error':
        document.title = 'Error loading vulnerability report';
        break;
    }
  }, [state]);

  // Restore deep-linked anchor navigation once report body is rendered
  useEffect(() => {
    if (state.status !== 'ready' || typeof window === 'undefined') return;
    const hash = window.location.hash;
    if (hash && hash.length > 1) {
      const targetId = decodeURIComponent(hash.slice(1));
      const element = document.getElementById(targetId);
      if (element) {
        element.scrollIntoView();
      }
    }
  }, [state.status]);

  const bodyHtml = useMemo(() => {
    if (state.status !== 'ready') return '';
    return renderProjectReportBody(state.model);
  }, [state]);

  return (
    <FinalReportLayout
      toolbar={
        <nav aria-label="Breadcrumb" className="flex items-center gap-4 text-sm">
          <a
            id="back-to-reports-link"
            href="/reports/index.html"
            className="font-semibold text-sky-700 hover:text-sky-900 underline focus:outline-none focus:ring-2 focus:ring-sky-500 rounded"
          >
            ← Back to Report Index
          </a>
          <span className="text-slate-400" aria-hidden="true">
            /
          </span>
          <a
            id="dashboard-nav-link"
            href="/"
            className="text-slate-600 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500 rounded"
          >
            Dashboard
          </a>
          {projectId && runId && (
            <>
              <span className="text-slate-400" aria-hidden="true">
                /
              </span>
              <span className="font-mono text-xs text-slate-700 font-medium">
                {projectId} / {runId}
              </span>
            </>
          )}
        </nav>
      }
      exportAction={
        <ReportExportButton
          projectId={projectId}
          runId={runId}
          isReady={state.status === 'ready'}
          getReportElement={() => (typeof document !== 'undefined' ? document.getElementById('project-report-surface') : null)}
        />
      }
      statusView={<ProjectReportStatusView state={state} onReload={reload} />}
      reportContent={
        state.status === 'ready' ? (
          <div
            id="project-report-surface"
            className="project-report-surface"
            dangerouslySetInnerHTML={{ __html: bodyHtml }}
          />
        ) : null
      }
    />
  );
}

export default FinalProjectReportPage;
