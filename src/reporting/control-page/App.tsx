import { useSyncExternalStore } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary.js';
import { DashboardPage } from './pages/DashboardPage.js';
import { ReportManagementPage } from './pages/ReportManagementPage.js';
import { FinalProjectReportPage } from './pages/final-project-report-page.js';
import { parseProjectReportRoute } from '../project-report-route.js';

function getPathname(): string {
  return typeof window !== 'undefined' ? window.location.pathname : '/';
}

function subscribeToLocation(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('popstate', callback);
  return () => window.removeEventListener('popstate', callback);
}

function NotFoundView({ pathname }: { readonly pathname: string }) {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-slate-800">
      <div className="max-w-md w-full bg-white p-6 rounded-lg border border-slate-300 shadow-sm text-center space-y-4">
        <h1 className="text-xl font-bold text-slate-900 m-0">Page Not Found</h1>
        <p className="text-sm text-slate-600 m-0">
          The requested path <code>{pathname}</code> was not recognized.
        </p>
        <div className="flex justify-center gap-3 pt-2">
          <a
            href="/"
            className="px-4 py-2 bg-sky-700 hover:bg-sky-800 text-white text-sm font-medium rounded shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
          >
            Dashboard
          </a>
          <a
            href="/reports/index.html"
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 text-sm font-medium rounded focus:outline-none focus:ring-2 focus:ring-slate-400"
          >
            Report Index
          </a>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const pathname = useSyncExternalStore(subscribeToLocation, getPathname, () => '/');

  const isFinalReport = parseProjectReportRoute(pathname) !== undefined;
  const isReportsIndex = pathname === '/reports/index.html';
  const isDashboard = pathname === '/' || pathname === '';

  let pageContent: React.ReactNode;
  if (isFinalReport) {
    pageContent = <FinalProjectReportPage />;
  } else if (isReportsIndex) {
    pageContent = <ReportManagementPage />;
  } else if (isDashboard) {
    pageContent = <DashboardPage />;
  } else {
    pageContent = <NotFoundView pathname={pathname} />;
  }

  return <ErrorBoundary>{pageContent}</ErrorBoundary>;
}
