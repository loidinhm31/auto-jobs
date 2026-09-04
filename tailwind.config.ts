import type { Config } from 'tailwindcss';

export default {
  content: ['./src/reporting/control-page/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg-color, #f8fafc)',
        card: 'var(--card-bg, #ffffff)',
        text: {
          main: 'var(--text-main, #0f172a)',
          muted: 'var(--text-muted, #475569)',
        },
        border: 'var(--border-color, #cbd5e1)',
        primary: {
          DEFAULT: 'var(--primary, #0369a1)',
          hover: 'var(--primary-hover, #075985)',
          text: 'var(--primary-text, #ffffff)',
        },
        secondary: {
          DEFAULT: 'var(--secondary, #e2e8f0)',
          hover: 'var(--secondary-hover, #cbd5e1)',
          text: 'var(--secondary-text, #0f172a)',
        },
        danger: {
          DEFAULT: 'var(--danger, #dc2626)',
          hover: 'var(--danger-hover, #b91c1c)',
          text: 'var(--danger-text, #ffffff)',
        },
        status: {
          success: 'var(--status-success, #16a34a)',
          warning: 'var(--status-warning, #d97706)',
          error: 'var(--status-error, #dc2626)',
        },
      },
      ringColor: {
        DEFAULT: 'var(--focus-ring, #0284c7)',
      },
      fontFamily: {
        mono: ['var(--mono-font)', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config;
