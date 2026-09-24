import { useCallback, useEffect, useState } from 'react';
import type { AggregateReportResult } from '../types/report-management-types.js';
import { useDeleteReports } from '../hooks/use-delete-reports.js';
import { ProjectReportHistoryCard } from '../components/organisms/ProjectReportHistoryCard.js';
import { DeleteReportsConfirmationDialog } from '../components/organisms/DeleteReportsConfirmationDialog.js';
import { StatusBanner } from '../components/atoms/StatusBanner.js';

type PageStatus = 'loading' | 'success' | 'empty' | 'corrupt' | 'error';

export function ReportManagementPage() {
  const [status, setStatus] = useState<PageStatus>('loading');
  const [aggregate, setAggregate] = useState<AggregateReportResult | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'info' | 'error'; text: string } | null>(null);

  const fetchAggregate = useCallback(async () => {
    try {
      const resp = await fetch('/reports/aggregate-data.json', {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });

      if (resp.status === 404) {
        setAggregate(null);
        setStatus('empty');
        return;
      }

      if (!resp.ok) {
        setStatus('error');
        return;
      }

      const data = (await resp.json()) as AggregateReportResult;
      if (!data || data.schemaVersion !== 3 || !Array.isArray(data.projects)) {
        setStatus('corrupt');
        return;
      }

      setAggregate(data);
      setStatus(data.projects.length === 0 ? 'empty' : 'success');
    } catch {
      setStatus('error');
    }
  }, []);

  const {
    targetProject,
    isDeleting,
    deleteError,
    openDeleteDialog,
    closeDeleteDialog,
    confirmDelete,
  } = useDeleteReports({
    onSuccess: fetchAggregate,
    onFeedback: setFeedback,
  });

  useEffect(() => {
    void fetchAggregate();
  }, [fetchAggregate]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <header className="app-header report-header bg-white border-b border-slate-300 py-4 px-6">
        <div className="header-container max-w-[1200px] mx-auto flex flex-wrap justify-between items-center gap-4">
          <div className="flex items-center gap-6">
            <h1 className="m-0 text-2xl font-bold text-slate-900">Vulnerability report index</h1>
            <nav aria-label="Navigation">
              <a
                id="back-to-dashboard-link"
                href="/"
                className="text-sm font-semibold text-sky-700 hover:text-sky-900 underline focus:outline-none focus:ring-2 focus:ring-sky-500 rounded"
              >
                ← Back to Dashboard
              </a>
            </nav>
          </div>
          {aggregate?.generatedAt ? (
            <p className="lede text-xs text-slate-500 m-0">
              Generated {aggregate.generatedAt} · {aggregate.projects.length} retained project(s)
            </p>
          ) : null}
        </div>
      </header>

      <main id="main-content" className="main-container max-w-[1200px] mx-auto py-6 px-4">
        {feedback ? (
          <StatusBanner
            id="report-feedback-banner"
            variant={feedback.type}
            message={feedback.text}
            visible={true}
          />
        ) : null}

        {status === 'loading' ? (
          <div className="p-12 text-center text-slate-500">
            <span className="inline-block animate-spin mr-2 h-4 w-4 border-2 border-sky-600 border-t-transparent rounded-full" />
            Loading report inventory...
          </div>
        ) : null}

        {status === 'corrupt' ? (
          <div role="alert" className="p-4 bg-amber-50 border border-amber-300 text-amber-900 rounded mb-6 text-sm">
            Failed to parse report aggregate data. Manifest data may be invalid or corrupted.
          </div>
        ) : null}

        {status === 'error' ? (
          <div role="alert" className="p-4 bg-red-50 border border-red-300 text-red-900 rounded mb-6 text-sm">
            Unable to load reports inventory. Server may be unavailable.
          </div>
        ) : null}

        {status === 'empty' ? (
          <div className="empty-state-container p-8 text-center bg-white border border-slate-300 rounded-lg shadow-sm">
            <p className="empty-state text-slate-600 font-medium m-0">
              No retained project reports were recorded.
            </p>
            <p className="text-xs text-slate-400 mt-2 mb-0">
              Run reports from the dashboard to generate persistent report artifacts.
            </p>
          </div>
        ) : null}

        {status === 'success' && aggregate ? (
          <>
            {aggregate.warnings && aggregate.warnings.length > 0 ? (
              <section id="aggregate-warnings" aria-labelledby="aggregate-warnings-heading" className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
                <div className="section-heading flex justify-between items-center mb-2">
                  <h2 id="aggregate-warnings-heading" className="text-base font-bold text-amber-900 m-0">Aggregate warnings</h2>
                  <span className="state-badge state-incomplete text-xs bg-amber-200 text-amber-900 px-2 py-0.5 rounded-full font-bold">{aggregate.warnings.length}</span>
                </div>
                <ul className="warning-list text-xs text-amber-800 list-disc list-inside m-0">
                  {aggregate.warnings.map((w, idx) => <li key={idx}>{w}</li>)}
                </ul>
              </section>
            ) : null}

            <div className="projects-report-list">
              {aggregate.projects.map((proj) => (
                <ProjectReportHistoryCard
                  key={proj.projectId}
                  project={proj}
                  onDeleteClick={openDeleteDialog}
                />
              ))}
            </div>
          </>
        ) : null}
      </main>

      <DeleteReportsConfirmationDialog
        isOpen={Boolean(targetProject)}
        isLoading={isDeleting}
        projectId={targetProject?.projectId ?? null}
        projectName={targetProject?.name ?? null}
        runsCount={targetProject?.runs.length ?? 0}
        errorMessage={deleteError}
        onClose={closeDeleteDialog}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
