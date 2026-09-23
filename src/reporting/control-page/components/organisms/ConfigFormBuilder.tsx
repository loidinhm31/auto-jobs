import { useEffect, useState } from 'react';
import type {
  ProjectConfigDefaults,
  ProjectConfigDocumentV1,
  ProjectConfigInput,
} from '../../types/index.js';
import { Button } from '../atoms/Button.js';
import { Select } from '../atoms/Select.js';
import { ConfigDefaultsEditor } from '../molecules/ConfigDefaultsEditor.js';
import { ConfigProjectEditor } from '../molecules/ConfigProjectEditor.js';

export interface ConfigFormBuilderProps {
  document: ProjectConfigDocumentV1 | null;
  validationErrors: readonly string[];
  onAddProject(): string | null;
  onUpdateProject(projectIndex: number, update: (previous: ProjectConfigInput) => ProjectConfigInput): void;
  onRemoveProject(projectIndex: number): boolean;
  onUpdateDefaults(update: (previous: ProjectConfigDefaults) => ProjectConfigDefaults): void;
}


export function ConfigFormBuilder({
  document,
  validationErrors,
  onAddProject,
  onUpdateProject,
  onRemoveProject,
  onUpdateDefaults,
}: ConfigFormBuilderProps) {
  const projects = document?.projects ?? [];
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [addBlocked, setAddBlocked] = useState(false);
  const [removeBlocked, setRemoveBlocked] = useState(false);
  const project = projects[selectedIndex];

  useEffect(() => {
    if (selectedIndex >= projects.length) setSelectedIndex(Math.max(0, projects.length - 1));
  }, [projects.length, selectedIndex]);

  const canRemove = projects.length > 1
    && projects.some((item, index) => index !== selectedIndex && item.enabled !== false);
  const removeMessage = projects.length <= 1
    ? 'A configuration must keep at least one project.'
    : !canRemove
      ? 'At least one project must remain enabled; enable another project before removing this one.'
      : '';

  return (
    <section className="space-y-5 rounded-lg border border-slate-300 bg-white p-4 sm:p-6" aria-labelledby="config-form-title">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="config-form-title" className="text-lg font-bold text-slate-900">Project configuration</h2>
          <p className="text-sm text-slate-600">Edit project settings and environment-variable references.</p>
        </div>
        <Button disabled={!document} onClick={() => {
          const id = onAddProject();
          setAddBlocked(!id);
          if (id) setSelectedIndex(projects.length);
        }}>
          Add New Project
        </Button>
      </header>
      {addBlocked && <p className="text-sm text-red-700" role="status">A project could not be added to this configuration.</p>}
      {!document && <p className="text-sm text-slate-600">Load a configuration before adding or editing projects.</p>}
      {validationErrors.length > 0 && (
        <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800" role="alert" aria-label="Configuration validation errors">
          <ul className="list-disc pl-5">
            {validationErrors.map((error, index) => <li key={`${index}-${error}`}>{error}</li>)}
          </ul>
        </div>
      )}
      {document && <>
        <div className="flex flex-wrap items-end gap-3">
          <Select
            id="project-selection"
            label="Selected project"
            value={String(selectedIndex)}
            onChange={(event) => setSelectedIndex(Number(event.target.value))}
            options={projects.map((item, index) => ({
              value: String(index),
              label: item.name ? `${item.name} (${item.id})` : item.id,
            }))}
            className="min-h-11 min-w-48"
          />
          <Button variant="danger" disabled={!canRemove} onClick={() => {
            if (onRemoveProject(selectedIndex)) {
              setRemoveBlocked(false);
              setSelectedIndex(Math.max(0, Math.min(selectedIndex, projects.length - 2)));
            } else {
              setRemoveBlocked(true);
            }
          }}>
            {projects.length <= 1 ? 'Keep at least one project' : 'Remove Project'}
          </Button>
        </div>
        {(removeBlocked || removeMessage) && (
          <p className="text-xs text-slate-600" role={removeBlocked ? 'alert' : 'status'}>
            {removeBlocked ? 'This project cannot be removed; retain at least one project and one enabled project.' : removeMessage}
          </p>
        )}
        {project && (
          <ConfigProjectEditor
            project={project}
            projectIndex={selectedIndex}
            defaultsCredentials={document.defaults?.credentials}
            validationErrors={validationErrors}
            onUpdate={(update) => onUpdateProject(selectedIndex, update)}
          />
        )}
        <ConfigDefaultsEditor
          defaults={document.defaults}
          validationErrors={validationErrors}
          onUpdate={onUpdateDefaults}
        />
      </>}
    </section>
  );
}
