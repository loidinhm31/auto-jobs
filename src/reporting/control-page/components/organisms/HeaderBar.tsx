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
        <h1 className="m-0 text-2xl font-bold text-slate-900">{title}</h1>
        <ConfigSelectorBar {...selectorProps} />
      </div>
    </header>
  );
}
