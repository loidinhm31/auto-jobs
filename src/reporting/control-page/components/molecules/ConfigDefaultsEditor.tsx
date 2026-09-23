import type {
  BrowserName,
  ProjectConfigDefaults,
  ProjectCredentialReferences,
} from '../../types/index.js';
import { Input } from '../atoms/Input.js';
import { Select } from '../atoms/Select.js';

interface ConfigDefaultsEditorProps {
  defaults: ProjectConfigDefaults | undefined;
  validationErrors: readonly string[];
  onUpdate: (update: (previous: ProjectConfigDefaults) => ProjectConfigDefaults) => void;
}

type CredentialKey = 'usernameVariable' | 'passwordVariable';
type DefaultField = 'timeoutMs' | 'browser' | 'artifactDir';

const browsers: { value: BrowserName; label: string }[] = [
  { value: 'chromium', label: 'Chromium' },
  { value: 'firefox', label: 'Firefox' },
  { value: 'webkit', label: 'WebKit' },
];

export function ConfigDefaultsEditor({
  defaults,
  validationErrors,
  onUpdate,
}: ConfigDefaultsEditorProps) {
  const credentials: ProjectCredentialReferences | undefined = defaults?.credentials;
  const fieldError = (field: string): string => validationErrors.find(
    (error) => error.startsWith(`config.defaults.${field} `),
  ) ?? '';
  const updateField = (key: DefaultField, value: string) => onUpdate((previous) => {
    if (!value) {
      const { [key]: _removed, ...rest } = previous;
      return rest;
    }
    return {
      ...previous,
      [key]: key === 'timeoutMs' ? Number(value) : key === 'browser' ? value as BrowserName : value,
    };
  });
  const updateCredential = (key: CredentialKey, value: string) => onUpdate((previous) => {
    const current = previous.credentials;
    const next = {
      usernameVariable: current?.usernameVariable ?? '',
      passwordVariable: current?.passwordVariable ?? '',
      [key]: value,
    };
    if (next.usernameVariable || next.passwordVariable) return { ...previous, credentials: next };
    const { credentials: _removed, ...rest } = previous;
    return rest;
  });
  const credentialField = (key: CredentialKey) => {
    const id = `config-default-${key}`;
    return (
      <div className="space-y-1">
        <Input
          id={id}
          label={key === 'usernameVariable' ? 'Default username environment variable' : 'Default password environment variable'}
          value={credentials?.[key] ?? ''}
          placeholder="e.g. JENKINS_USERNAME"
          onChange={(event) => updateCredential(key, event.target.value)}
          error={fieldError(`credentials.${key}`)}
          autoCapitalize="off"
        />
        <p className="text-xs text-slate-500">Environment-variable name only; never enter a credential value.</p>
      </div>
    );
  };

  return (
    <details className="border-t border-slate-200 pt-4">
      <summary className="min-h-11 cursor-pointer rounded py-2 text-sm font-semibold text-sky-800 underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-700">
        Edit configuration defaults
      </summary>
      <p className="text-xs text-slate-600">Project values take precedence; missing project credential references inherit defaults.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Input
          id="config-default-timeout"
          label="Default timeout (ms)"
          type="number"
          min={1000}
          max={3600000}
          step={1}
          value={defaults?.timeoutMs == null ? '' : String(defaults.timeoutMs)}
          onChange={(event) => updateField('timeoutMs', event.target.value)}
          error={fieldError('timeoutMs')}
        />
        <div className="flex flex-col gap-1">
          <Select
            id="config-default-browser"
            label="Default browser"
            value={defaults?.browser ?? ''}
            options={[{ value: '', label: 'Not set' }, ...browsers]}
            onChange={(event) => updateField('browser', event.target.value)}
            className="min-h-11"
            aria-invalid={Boolean(fieldError('browser'))}
            aria-describedby={fieldError('browser') ? 'config-default-browser-error' : undefined}
          />
          {fieldError('browser') && <span id="config-default-browser-error" className="text-xs font-medium text-red-600" role="alert">{fieldError('browser')}</span>}
        </div>
        <Input
          id="config-default-artifact-dir"
          label="Default artifact directory"
          value={defaults?.artifactDir ?? ''}
          onChange={(event) => updateField('artifactDir', event.target.value)}
          error={fieldError('artifactDir')}
        />
        <div className="grid gap-4 sm:col-span-2 sm:grid-cols-2">
          {credentialField('usernameVariable')}
          {credentialField('passwordVariable')}
        </div>
      </div>
    </details>
  );
}
