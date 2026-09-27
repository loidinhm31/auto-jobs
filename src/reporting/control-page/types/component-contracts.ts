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

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'outline' | 'ghost';

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
  className?: string | undefined;
  id?: string | undefined;
  dot?: boolean | undefined;
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant | undefined;
  size?: ButtonSize | undefined;
  disabled?: boolean | undefined;
  loading?: boolean | undefined;
  asChild?: boolean | undefined;
  className?: string | undefined;
  id?: string | undefined;
  children?: ReactNode;
  'data-key'?: string | undefined;
  [key: `data-${string}`]: unknown;
}

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  id: string;
  checked?: boolean | undefined;
  defaultChecked?: boolean | undefined;
  onCheckedChange?: ((checked: boolean) => void) | undefined;
  label?: ReactNode;
  ariaLabel?: string | undefined;
  className?: string | undefined;
  disabled?: boolean | undefined;
}

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  asChild?: boolean | undefined;
  className?: string | undefined;
  children?: ReactNode;
}

export interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  asChild?: boolean | undefined;
  className?: string | undefined;
  children?: ReactNode;
}

export interface CardTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {
  asChild?: boolean | undefined;
  className?: string | undefined;
  children?: ReactNode;
}

export interface CardDescriptionProps extends React.HTMLAttributes<HTMLParagraphElement> {
  asChild?: boolean | undefined;
  className?: string | undefined;
  children?: ReactNode;
}

export interface CardContentProps extends React.HTMLAttributes<HTMLDivElement> {
  asChild?: boolean | undefined;
  className?: string | undefined;
  children?: ReactNode;
}

export interface CardFooterProps extends React.HTMLAttributes<HTMLDivElement> {
  asChild?: boolean | undefined;
  className?: string | undefined;
  children?: ReactNode;
}

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: ReactNode;
  ariaLabel?: string | undefined;
  variant?: ButtonVariant | undefined;
  size?: ButtonSize | undefined;
  loading?: boolean | undefined;
  tooltip?: string | undefined;
  asChild?: boolean | undefined;
  className?: string | undefined;
}

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  id: string;
  label?: string | undefined;
  error?: string | undefined;
  className?: string | undefined;
}

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  id: string;
  options?: SelectOption[] | undefined;
  label?: string | undefined;
  ariaLabel?: string | undefined;
  className?: string | undefined;
}

export interface StatusBannerProps {
  variant: BannerVariant;
  message: string;
  visible?: boolean | undefined;
  className?: string | undefined;
  id?: string | undefined;
}

export interface LoadingIndicatorProps {
  visible?: boolean | undefined;
  id?: string | undefined;
  message?: string | undefined;
  className?: string | undefined;
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

export interface FormFieldProps {
  id: string;
  label?: ReactNode;
  required?: boolean;
  helperText?: ReactNode;
  error?: ReactNode;
  className?: string;
  labelClassName?: string;
  orientation?: 'vertical' | 'horizontal';
  children?: ReactNode;
}

export interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  backLink?: {
    href: string;
    label: string;
    id?: string;
    className?: string;
  };
  breadcrumbs?: ReactNode;
  badges?: ReactNode;
  actions?: ReactNode;
  className?: string;
  containerClassName?: string;
  id?: string;
  titleId?: string;
  level?: 1 | 2;
}

export interface DashboardLayoutProps {
  header: ReactNode;
  banner?: ReactNode;
  projectsSection: ReactNode;
  formBuilderSection: ReactNode;
  rawJsonSection: ReactNode;
  actionsSection: ReactNode;
  runSection: ReactNode;
  dialogs?: ReactNode;
}

export interface ReportManagementLayoutProps {
  header: ReactNode;
  banner?: ReactNode;
  searchFilter?: ReactNode;
  content?: ReactNode;
  historyList?: ReactNode;
  dialogs?: ReactNode;
  children?: ReactNode;
}

export interface FinalReportLayoutProps {
  header?: ReactNode;
  toolbar?: ReactNode;
  exportAction?: ReactNode;
  statusView?: ReactNode;
  reportContent?: ReactNode;
  children?: ReactNode;
}
