import React from 'react';
import type { RunLogEntry, RunResult, RunStatus } from '../../types/index.js';
import { Badge } from '../atoms/Badge.js';
import { LogViewer } from '../molecules/LogViewer.js';
import { RunResultBox } from '../molecules/RunResultBox.js';
import { cn } from '../../utils/cn.js';

export interface RunStatusCardProps {
  runId: string | null;
  status: RunStatus;
  logs: RunLogEntry[] | string;
  result: RunResult | null;
  className?: string;
}

export function RunStatusCard({
  runId,
  status,
  logs,
  result,
  className,
}: RunStatusCardProps) {
  return (
    <div id="run-status-card" className={cn('run-card flex flex-col gap-4', className)}>
      <div className="run-card-header flex items-center justify-between gap-4 flex-wrap bg-slate-50 border border-slate-200 rounded-lg p-3">
        <div className="flex items-center gap-3">
          <Badge id="run-status-badge" variant={status}>
            {status}
          </Badge>
          <span id="run-id-display" className="run-id font-mono text-xs font-semibold text-slate-700 bg-white border border-slate-200 px-2 py-0.5 rounded">
            {runId ? `ID: ${runId}` : ''}
          </span>
        </div>
      </div>

      <RunResultBox id="run-result-box" result={result} />

      <div className="log-viewer">
        <h3 className="text-sm font-semibold text-slate-700 m-0 mb-2">Execution Logs</h3>
        <LogViewer id="run-logs" logs={logs} />
      </div>
    </div>
  );
}
