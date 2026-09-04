import React from 'react';
import { ErrorBoundary } from './components/ErrorBoundary.js';
import { DashboardPage } from './pages/DashboardPage.js';

export default function App() {
  return (
    <ErrorBoundary>
      <DashboardPage />
    </ErrorBoundary>
  );
}
