import type { ReactNode, Ref } from 'react';
import type {
  BrowserSettingKey,
  RunLogEntry,
  RunResult,
  RunStatus,
} from './index.js';

export type { BrowserSettingKey, RunLogEntry, RunResult, RunStatus };

export type BadgeVariant =
  | 'idle'
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'unknown'
  | 'submission-unknown'
  | 'configured'
  | 'missing'
  | 'not-set';

export type BannerVariant = 'info' | 'success' | 'error';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'outline';

export type ButtonSize = 'sm' | 'md' | 'lg' | 'default';

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
  waitForCompletion?: boolean | undefined;
  waitTimeoutMs?: number | undefined;
  enabled: boolean;
  credentials?: {
    usernameVariable: string;
    passwordVariable: string;
  };
  groupId?: string | undefined;
}

export interface RunStateData {
  runId: string | null;
  status: RunStatus;
  logs: RunLogEntry[];
  result: RunResult | null;
}

export interface BadgeProps {
  variant: BadgeVariant;
  children?: ReactNode;
  className?: string;
  id?: string;
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  id?: string;
  children?: ReactNode;
  'data-key'?: string;
  [key: `data-${string}`]: unknown;
}

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  id: string;
  label?: string;
  error?: string;
  className?: string;
}

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  id: string;
  options?: SelectOption[];
  label?: string;
  ariaLabel?: string;
  className?: string;
}

export interface StatusBannerProps {
  variant: BannerVariant;
  message: string;
  visible?: boolean;
  className?: string;
  id?: string;
}

export interface LoadingIndicatorProps {
  visible?: boolean;
  id?: string;
  message?: string;
  className?: string;
}

export interface CredentialRowProps {
  secretKey?: string;
  credential?: CredentialRowData;
  isConfigured?: boolean;
  value?: string;
  onChange?: (value: string) => void;
  onClear?: (key: string) => Promise<void> | void;
  className?: string;
  inputRef?: Ref<HTMLInputElement>;
}

export interface BrowserSettingRowProps {
  settingKey?: BrowserSettingKey;
  setting?: BrowserSettingData;
  isConfigured?: boolean;
  value?: string;
  onChange?: (value: string) => void;
  onClear?: (key: BrowserSettingKey) => Promise<void> | void;
  children?: ReactNode;
  className?: string;
}

export interface ConfigOption {
  value: string;
  label: string;
}

export interface ConfigSelectorBarProps {
  configs: (string | ConfigOption)[];
  activeConfig: string;
  onSelectConfig: (name: string) => void;
  onReload: () => void;
  onSave: () => void;
  onOpenCredentials: () => void;
  onOpenBrowserSettings: () => void;
  isDirty?: boolean;
  isSaving?: boolean;
  isLoading?: boolean;
  className?: string;
}

export interface LogViewerProps {
  logs: RunLogEntry[] | string;
  isLoading?: boolean;
  className?: string;
  id?: string;
}

export interface RunResultBoxProps {
  result: RunResult | null;
  visible?: boolean;
  className?: string;
  id?: string;
}
