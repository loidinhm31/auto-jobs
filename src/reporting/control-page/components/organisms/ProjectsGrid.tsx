import React from 'react';
import type { ProjectCardData } from '../../types/component-contracts.js';
import { ProjectCard } from './ProjectCard.js';
import { cn } from '../../utils/cn.js';

export interface ProjectsGridProps {
  projects: ProjectCardData[];
  isDirty?: boolean;
  onToggleEnabled: (projectId: string, enabled: boolean) => void;
  onChangeRunType: (projectId: string, runType: 'report' | 'auto-build') => void;
  className?: string;
}

export function ProjectsGrid({
  projects,
  isDirty = false,
  onToggleEnabled,
  onChangeRunType,
  className,
}: ProjectsGridProps) {
  return (
    <div
      id="projects-list"
      className={cn(
        'projects-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4',
        className,
      )}
    >
      {projects.length === 0 ? (
        <p className="text-sm text-slate-500 italic col-span-full py-4">
          No projects configured in this document.
        </p>
      ) : (
        projects.map((project) => (
          <ProjectCard
            key={project.id}
            project={project}
            isDirty={isDirty}
            onToggleEnabled={onToggleEnabled}
            onChangeRunType={onChangeRunType}
          />
        ))
      )}
    </div>
  );
}
