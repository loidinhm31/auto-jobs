import type {
  ProjectConfigInput,
  ProjectCredentialReferences,
} from '../../types/index.js';
import { Button } from '../atoms/Button.js';
import { Input } from '../atoms/Input.js';
import { Select } from '../atoms/Select.js';

interface ConfigProjectEditorProps {
  project: ProjectConfigInput;
  projectIndex: number;
  defaultsCredentials: ProjectCredentialReferences | undefined;
  validationErrors: readonly string[];
  onUpdate: (update: (previous: ProjectConfigInput) => ProjectConfigInput) => void;
}

type CredentialKey = 'usernameVariable' | 'passwordVariable';

const runTypes = [
  { value: 'report', label: 'Report' },
  { value: 'auto-build', label: 'Auto-build' },
];

export function ConfigProjectEditor({
  project,
  projectIndex,
  defaultsCredentials,
  validationErrors,
  onUpdate,
}: ConfigProjectEditorProps) {
  const fieldError = (field: string): string => validationErrors.find(
    (error) => error.startsWith(`projects[${projectIndex}].${field} `),
  ) ?? '';
  const updateField = (field: keyof ProjectConfigInput, value: string | boolean) => {
    onUpdate((previous) => ({ ...previous, [field]: value }));
  };
  const updateCredential = (key: CredentialKey, value: string) => onUpdate((previous) => {
    const current = previous.credentials ?? defaultsCredentials;
    const credentials = {
      usernameVariable: current?.usernameVariable ?? '',
      passwordVariable: current?.passwordVariable ?? '',
      [key]: value,
    };
    if (!credentials.usernameVariable && !credentials.passwordVariable) {
      const { credentials: _removed, ...rest } = previous;
      return rest;
    }
    return { ...previous, credentials };
  });
  const clearCredentialOverride = () => onUpdate((previous) => {
    const { credentials: _removed, ...rest } = previous;
    return rest;
  });
  const textField = (
    id: string,
    field: 'id' | 'name' | 'loginUrl' | 'jobUrl',
    label: string,
    value: string,
    type = 'text',
  ) => (
    <Input
      id={id}
      label={label}
      value={value}
      type={type}
      error={fieldError(field)}
      onChange={(event) => updateField(field, event.target.value)}
    />
  );
  const credentialField = (key: CredentialKey, fallback?: string) => {
    const id = `config-project-${key}`;
    return (
      <div className="space-y-1">
        <Input
          id={id}
          label={key === 'usernameVariable' ? 'Username environment variable' : 'Password environment variable'}
          value={project.credentials?.[key] ?? ''}
          placeholder={fallback ? `Inherited: ${fallback}` : 'e.g. JENKINS_USERNAME'}
          onChange={(event) => updateCredential(key, event.target.value)}
          error={fieldError(`credentials.${key}`)}
          autoCapitalize="off"
        />
        <p className="text-xs text-slate-500">Environment-variable name only; never enter a credential value.</p>
      </div>
    );
  };
  const runTypeError = fieldError('runType');
  const enabledError = fieldError('enabled');

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {textField('config-project-id', 'id', 'ID', project.id)}
      {textField('config-project-name', 'name', 'Name', project.name)}
      {textField('config-project-login-url', 'loginUrl', 'Login URL', project.loginUrl, 'url')}
      {textField('config-project-job-url', 'jobUrl', 'Job URL', project.jobUrl, 'url')}
      <div className="flex flex-col gap-1">
        <Select
          id="config-project-run-type"
          label="Run type"
          value={project.runType ?? 'report'}
          options={runTypes}
          onChange={(event) => updateField('runType', event.target.value as 'report' | 'auto-build')}
          className="min-h-11"
          aria-invalid={Boolean(runTypeError)}
          aria-describedby={runTypeError ? 'config-project-run-type-error' : undefined}
        />
        {runTypeError && <span id="config-project-run-type-error" className="text-xs font-medium text-red-600" role="alert">{runTypeError}</span>}
      </div>
      <div>
        <label className="flex min-h-11 items-center gap-2 text-sm font-medium text-slate-800">
          <input
            type="checkbox"
            checked={project.enabled !== false}
            onChange={(event) => updateField('enabled', event.target.checked)}
            className="h-4 w-4 accent-sky-700"
            aria-invalid={Boolean(enabledError)}
            aria-describedby={enabledError ? 'config-project-enabled-error' : undefined}
          />
          Enabled
        </label>
        {enabledError && <span id="config-project-enabled-error" className="text-xs font-medium text-red-600" role="alert">{enabledError}</span>}
      </div>
      <div className="space-y-2 sm:col-span-2">
        <div className="grid gap-4 sm:grid-cols-2">
          {credentialField('usernameVariable', project.credentials ? undefined : defaultsCredentials?.usernameVariable)}
          {credentialField('passwordVariable', project.credentials ? undefined : defaultsCredentials?.passwordVariable)}
        </div>
        {project.credentials && (
          <Button size="sm" variant="outline" onClick={clearCredentialOverride}>
            Use default credential references
          </Button>
        )}
      </div>
    </div>
  );
}
