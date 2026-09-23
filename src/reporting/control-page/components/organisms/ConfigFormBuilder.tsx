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
import { validateProject } from '../../../../config/project-config-project-validation.js';
import { PROJECT_CONFIG_LIMITS } from '../../../../config/project-config-schema.js';

export interface ConfigFormBuilderProps {
  document: ProjectConfigDocumentV1 | null;
  validationErrors: readonly string[];
  onAddProject(project?: ProjectConfigInput): string | null;
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
  const [isAddingProject, setIsAddingProject] = useState(false);
  const [newProjectDraft, setNewProjectDraft] = useState<ProjectConfigInput | null>(null);
  const [draftValidationErrors, setDraftValidationErrors] = useState<string[]>([]);
  const project = projects[selectedIndex];

  useEffect(() => {
    if (selectedIndex >= projects.length) setSelectedIndex(Math.max(0, projects.length - 1));
  }, [projects.length, selectedIndex]);

  const handleStartAddProject = () => {
    if (!document) return;
    if (projects.length >= PROJECT_CONFIG_LIMITS.maxProjects) {
      setAddBlocked(true);
      return;
    }
    const ids = new Set(projects.map((p) => p.id));
    let newId = 'new-project';
    for (let suffix = 2; ids.has(newId); suffix += 1) newId = `new-project-${suffix}`;

    setNewProjectDraft({
      id: newId,
      name: 'New Project',
      loginUrl: '',
      jobUrl: '',
      runType: 'report',
      enabled: true,
    });
    setIsAddingProject(true);
    setDraftValidationErrors([]);
    setAddBlocked(false);
  };

  const handleSaveNewProject = () => {
    if (!newProjectDraft || !document) return;
    const issues: string[] = [];
    validateProject(newProjectDraft, projects.length, issues);
    if (projects.some((p) => p.id === newProjectDraft.id)) {
      issues.push(`projects[${projects.length}].id must be unique; '${newProjectDraft.id}' is already in use`);
    }
    if (issues.length > 0) {
      setDraftValidationErrors(issues);
      return;
    }
    const id = onAddProject(newProjectDraft);
    if (id) {
      setIsAddingProject(false);
      setNewProjectDraft(null);
      setDraftValidationErrors([]);
      setSelectedIndex(projects.length);
    } else {
      setAddBlocked(true);
    }
  };

  const handleCancelNewProject = () => {
    setIsAddingProject(false);
    setNewProjectDraft(null);
    setDraftValidationErrors([]);
  };

  const canRemove = !isAddingProject && projects.length > 1
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
        <Button disabled={!document || isAddingProject} onClick={handleStartAddProject}>
          Add New Project
        </Button>
      </header>
      {addBlocked && <p className="text-sm text-red-700" role="status">A project could not be added to this configuration.</p>}
      {isAddingProject && (
        <div className="rounded border border-sky-300 bg-sky-50 p-3 text-sm text-sky-900" role="status">
          <p className="font-semibold">New project draft</p>
          <p className="text-xs text-sky-700">Enter project details below and click &quot;Save Project&quot; to apply it to the configuration.</p>
        </div>
      )}
      {!document && <p className="text-sm text-slate-600">Load a configuration before adding or editing projects.</p>}
      {(isAddingProject ? draftValidationErrors : validationErrors).length > 0 && (
        <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800" role="alert" aria-label="Configuration validation errors">
          <ul className="list-disc pl-5">
            {(isAddingProject ? draftValidationErrors : validationErrors).map((error, index) => <li key={`${index}-${error}`}>{error}</li>)}
          </ul>
        </div>
      )}
      {document && <>
        <div className="flex flex-wrap items-end gap-3">
          <Select
            id="project-selection"
            label="Selected project"
            value={isAddingProject ? '__draft__' : String(selectedIndex)}
            onChange={(event) => {
              if (event.target.value === '__draft__') return;
              if (isAddingProject) {
                setIsAddingProject(false);
                setNewProjectDraft(null);
                setDraftValidationErrors([]);
              }
              setSelectedIndex(Number(event.target.value));
            }}
            options={
              isAddingProject
                ? [
                    ...projects.map((item, index) => ({
                      value: String(index),
                      label: item.name ? `${item.name} (${item.id})` : item.id,
                    })),
                    { value: '__draft__', label: `+ ${newProjectDraft?.name || 'New Project'} (Draft)` },
                  ]
                : projects.map((item, index) => ({
                    value: String(index),
                    label: item.name ? `${item.name} (${item.id})` : item.id,
                  }))
            }
            className="min-h-11 min-w-48"
          />
          {isAddingProject ? (
            <Button variant="outline" id="btn-cancel-project" onClick={handleCancelNewProject}>
              Cancel
            </Button>
          ) : (
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
          )}
        </div>
        {!isAddingProject && (removeBlocked || removeMessage) && (
          <p className="text-xs text-slate-600" role={removeBlocked ? 'alert' : 'status'}>
            {removeBlocked ? 'This project cannot be removed; retain at least one project and one enabled project.' : removeMessage}
          </p>
        )}
        {isAddingProject && newProjectDraft ? (
          <div className="space-y-4">
            <ConfigProjectEditor
              project={newProjectDraft}
              projectIndex={projects.length}
              defaultsCredentials={document.defaults?.credentials}
              validationErrors={draftValidationErrors}
              onUpdate={(update) =>
                setNewProjectDraft((previous) => {
                  if (!previous) return previous;
                  const next = update(previous);
                  if (draftValidationErrors.length > 0) {
                    const issues: string[] = [];
                    validateProject(next, projects.length, issues);
                    if (projects.some((p) => p.id === next.id)) {
                      issues.push(`projects[${projects.length}].id must be unique; '${next.id}' is already in use`);
                    }
                    setDraftValidationErrors(issues);
                  }
                  return next;
                })
              }
            />
            <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 pt-3">
              <Button id="btn-save-project" onClick={handleSaveNewProject}>
                Save Project
              </Button>
              <Button variant="outline" onClick={handleCancelNewProject}>
                Cancel
              </Button>
            </div>
          </div>
        ) : project ? (
          <ConfigProjectEditor
            project={project}
            projectIndex={selectedIndex}
            defaultsCredentials={document.defaults?.credentials}
            validationErrors={validationErrors}
            onUpdate={(update) => onUpdateProject(selectedIndex, update)}
          />
        ) : null}
        <ConfigDefaultsEditor
          defaults={document.defaults}
          validationErrors={validationErrors}
          onUpdate={onUpdateDefaults}
        />
      </>}
    </section>
  );
}
