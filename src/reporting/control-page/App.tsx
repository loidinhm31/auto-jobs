import React, { useSyncExternalStore } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary.js';
import { DashboardPage } from './pages/DashboardPage.js';
import { ReportManagementPage } from './pages/ReportManagementPage.js';

function getPathname(): string {
  return typeof window !== 'undefined' ? window.location.pathname : '/';
}

function subscribeToLocation(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('popstate', callback);
  return () => window.removeEventListener('popstate', callback);
}

export default function App() {
  const pathname = useSyncExternalStore(subscribeToLocation, getPathname, () => '/');
  const isReportsPage = pathname === '/reports/index.html';

  return (
    <ErrorBoundary>
      {isReportsPage ? <ReportManagementPage /> : <DashboardPage />}
    </ErrorBoundary>
  );
}
