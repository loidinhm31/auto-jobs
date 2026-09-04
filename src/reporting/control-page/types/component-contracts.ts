import type { ReactNode } from 'react';
import type {
  BrowserSettingKey,
  RunLogEntry,
  RunResult,
  RunStatus,
} from './index.js';

export type BadgeVariant =
  | 'idle'
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'unknown'
  | 'configured'
  | 'missing'
  | 'not-set';

export type BannerVariant = 'info' | 'success' | 'error';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'outline';

export type ButtonSize = 'sm' | 'md' | 'lg';

export interface BannerMessage {
  type: BannerVariant;
  message: string;
}

export interface DialogMessage {
  type: BannerVariant;
  text: string;
  message?: string;
}

export interface CredentialRowData {
  key: string;
  isConfigured: boolean;
}

export interface BrowserSettingData {
  key: BrowserSettingKey;
  isConfigured: boolean;
  currentValue?: string;
}

export interface ProjectCardData {
  id: string;
  name: string;
  loginUrl: string;
  jobUrl: string;
  runType: 'report' | 'auto-build';
  enabled: boolean;
  credentials?: {
    usernameVariable: string;
    passwordVariable: string;
  };
}

export interface RunStateData {
  runId: string | null;
  status: RunStatus;
  logs: RunLogEntry[];
  result: RunResult | null;
}

export interface BadgeProps {
  variant: BadgeVariant;
  children: ReactNode;
  className?: string;
  id?: string;
}

export interface ButtonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  onClick?: () => void;
  children: ReactNode;
  className?: string;
  id?: string;
}

export interface StatusBannerProps {
  variant: BannerVariant;
  message: string;
  className?: string;
  id?: string;
}

export interface CredentialRowProps {
  credential: CredentialRowData;
  onClear?: (key: string) => Promise<void> | void;
  className?: string;
}

export interface BrowserSettingRowProps {
  setting: BrowserSettingData;
  onClear?: (key: BrowserSettingKey) => Promise<void> | void;
  className?: string;
}

export interface LogViewerProps {
  logs: RunLogEntry[];
  isLoading?: boolean;
  className?: string;
  id?: string;
}

export interface RunResultBoxProps {
  result: RunResult | null;
  className?: string;
  id?: string;
}
