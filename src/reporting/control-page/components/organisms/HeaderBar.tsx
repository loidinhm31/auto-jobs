import React from 'react';
import { ConfigSelectorBar } from '../molecules/ConfigSelectorBar.js';
import type { ConfigSelectorBarProps } from '../../types/component-contracts.js';

export interface HeaderBarProps extends ConfigSelectorBarProps {
  title?: string;
}

export function HeaderBar({
  title = 'Jenkins Control Dashboard',
  ...selectorProps
}: HeaderBarProps) {
  return (
    <header className="app-header bg-white border-b border-slate-300 py-4 px-6">
      <div className="header-container max-w-[1200px] mx-auto flex flex-wrap justify-between items-center gap-4">
        <div className="flex items-center gap-6">
          <h1 className="m-0 text-2xl font-bold text-slate-900">{title}</h1>
          <nav aria-label="Main Navigation">
            <a
              id="header-reports-link"
              href="/reports/index.html"
              className="text-sm font-semibold text-sky-700 hover:text-sky-900 underline focus:outline-none focus:ring-2 focus:ring-sky-500 rounded"
            >
              Reports
            </a>
          </nav>
        </div>
        <ConfigSelectorBar {...selectorProps} />
      </div>
    </header>
  );
}
