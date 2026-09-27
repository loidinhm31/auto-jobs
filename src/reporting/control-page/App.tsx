import { useSyncExternalStore } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary.js';
import { DashboardPage } from './pages/DashboardPage.js';
import { ReportManagementPage } from './pages/ReportManagementPage.js';
import { FinalProjectReportPage } from './pages/final-project-report-page.js';
import { parseProjectReportRoute } from '../project-report-route.js';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from './components/atoms/Card.js';
import { Button } from './components/atoms/Button.js';

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
    <main
      id="main-content"
      className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-slate-800"
    >
      <Card className="max-w-md w-full text-center">
        <CardHeader>
          <CardTitle asChild>
            <h1 className="text-xl font-bold text-slate-900 m-0">Page Not Found</h1>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-600 m-0">
            The requested path <code className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-xs font-mono">{pathname}</code> was not recognized.
          </p>
        </CardContent>
        <CardFooter className="justify-center gap-3">
          <Button asChild variant="primary">
            <a href="/">Dashboard</a>
          </Button>
          <Button asChild variant="secondary">
            <a href="/reports/index.html">Report Index</a>
          </Button>
        </CardFooter>
      </Card>
    </main>
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
