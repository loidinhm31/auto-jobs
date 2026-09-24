import type { Page } from '@playwright/test';
import { formatDurationHuman } from './stage-view-parser.js';

export interface CameraHudOptions {
  readonly lastDurationMs?: number | undefined;
  readonly timeoutMs?: number | undefined;
  readonly buildNumber?: string | undefined;
  readonly status?: string | undefined;
  readonly stageName?: string | undefined;
}

export async function injectCameraRecorderHud(
  page: Page,
  options: CameraHudOptions = {},
): Promise<void> {
  try {
    const lastDurationText =
      options.lastDurationMs && options.lastDurationMs > 0
        ? formatDurationHuman(options.lastDurationMs)
        : 'N/A';
    const timeoutText =
      options.timeoutMs && options.timeoutMs > 0
        ? formatDurationHuman(options.timeoutMs)
        : '15m';
    const statusText = options.status ?? 'DETECTING';
    const buildText = options.buildNumber ? ` ${options.buildNumber}` : '';
    const stageText = options.stageName ? ` | Stage: ${options.stageName}` : '';

    await page.evaluate(
      ({ lastDuration, timeout, status, build, stage }) => {
        let hud = document.getElementById('auto-jobs-camera-hud');
        if (!hud) {
          hud = document.createElement('div');
          hud.id = 'auto-jobs-camera-hud';
          hud.setAttribute(
            'style',
            [
              'position: fixed',
              'top: 12px',
              'left: 50%',
              'transform: translateX(-50%)',
              'z-index: 2147483647',
              'background: rgba(10, 15, 29, 0.92)',
              'color: #f8fafc',
              'border: 1px solid rgba(239, 68, 68, 0.6)',
              'border-radius: 6px',
              'padding: 6px 14px',
              'font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              'font-size: 12px',
              'line-height: 1.4',
              'letter-spacing: 0.5px',
              'box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5)',
              'pointer-events: none',
              'display: flex',
              'align-items: center',
              'gap: 10px',
              'user-select: none',
            ].join(';'),
          );

          // Add blinking REC indicator style if not present
          if (!document.getElementById('auto-jobs-camera-hud-style')) {
            const style = document.createElement('style');
            style.id = 'auto-jobs-camera-hud-style';
            style.textContent = `
              @keyframes auto-jobs-rec-pulse {
                0%, 100% { opacity: 1; transform: scale(1); }
                50% { opacity: 0.3; transform: scale(0.9); }
              }
              .auto-jobs-rec-dot {
                display: inline-block;
                width: 8px;
                height: 8px;
                background-color: #ef4444;
                border-radius: 50%;
                margin-right: 4px;
                animation: auto-jobs-rec-pulse 1.2s infinite ease-in-out;
              }
            `;
            document.head.appendChild(style);
          }

          document.body.appendChild(hud);
          (window as unknown as Record<string, unknown>)['__autoJobsHudStart'] = Date.now();
        }

        const startTime =
          ((window as unknown as Record<string, unknown>)['__autoJobsHudStart'] as number) || Date.now();
        const elapsedSec = Math.floor((Date.now() - startTime) / 1000);
        const mm = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
        const ss = String(elapsedSec % 60).padStart(2, '0');

        hud.innerHTML = `
          <span style="display:flex;align-items:center;color:#ef4444;font-weight:700;">
            <span class="auto-jobs-rec-dot"></span>REC
          </span>
          <span style="color:#94a3b8;">|</span>
          <span><strong>LAST BUILD:</strong> <span style="color:#38bdf8;">${lastDuration}</span></span>
          <span style="color:#94a3b8;">|</span>
          <span><strong>TIMEOUT BUDGET:</strong> <span style="color:#fbbf24;">${timeout}</span></span>
          <span style="color:#94a3b8;">|</span>
          <span><strong>ELAPSED:</strong> <span style="color:#a3e635;">${mm}:${ss}</span></span>
          <span style="color:#94a3b8;">|</span>
          <span><strong>STATUS:</strong> <span style="color:#f1f5f9;font-weight:600;">${status}${build}${stage}</span></span>
        `;
      },
      {
        lastDuration: lastDurationText,
        timeout: timeoutText,
        status: statusText,
        build: buildText,
        stage: stageText,
      },
    );
  } catch {
    // Non-blocking overlay failure
  }
}
