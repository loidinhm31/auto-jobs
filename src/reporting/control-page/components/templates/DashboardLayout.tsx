import React from 'react';

export interface DashboardLayoutProps {
  header: React.ReactNode;
  banner?: React.ReactNode;
  projectsSection: React.ReactNode;
  rawJsonSection: React.ReactNode;
  actionsSection: React.ReactNode;
  runSection: React.ReactNode;
  dialogs?: React.ReactNode;
}

export function DashboardLayout({
  header,
  banner,
  projectsSection,
  rawJsonSection,
  actionsSection,
  runSection,
  dialogs,
}: DashboardLayoutProps) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      {header}

      <main id="main-content" className="main-container max-w-[1200px] mx-auto py-6 px-4">
        {banner}

        <section
          aria-labelledby="section-projects-title"
          className="dashboard-section bg-white border border-slate-300 rounded-lg p-5 mb-6 shadow-sm"
        >
          <h2
            id="section-projects-title"
            className="text-lg font-bold text-slate-900 mt-0 mb-4 pb-2 border-b border-slate-200"
          >
            Projects
          </h2>
          {projectsSection}
        </section>

        <section
          aria-labelledby="section-editor-title"
          className="dashboard-section bg-white border border-slate-300 rounded-lg p-5 mb-6 shadow-sm"
        >
          {rawJsonSection}
        </section>

        <section
          aria-labelledby="section-actions-title"
          className="dashboard-section bg-white border border-slate-300 rounded-lg p-5 mb-6 shadow-sm"
        >
          <h2
            id="section-actions-title"
            className="text-lg font-bold text-slate-900 mt-0 mb-4 pb-2 border-b border-slate-200"
          >
            Execute Actions
          </h2>
          {actionsSection}
        </section>

        <section
          aria-labelledby="section-run-title"
          className="dashboard-section bg-white border border-slate-300 rounded-lg p-5 mb-6 shadow-sm"
        >
          <h2
            id="section-run-title"
            className="text-lg font-bold text-slate-900 mt-0 mb-4 pb-2 border-b border-slate-200"
          >
            Current / Recent Run
          </h2>
          {runSection}
        </section>
      </main>

      {dialogs}
    </div>
  );
}
