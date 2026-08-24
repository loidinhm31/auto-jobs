import type { BuildReference } from '../types.js';
import type { ProjectRunIdentity } from './project-types.js';

export type ProjectRunPhase =
  | 'validated'
  | 'authenticated'
  | 'job_resolved'
  | 'capability_checked'
  | 'parameterized_failure'
  | 'existing_build_selected'
  | 'baseline_captured'
  | 'submitted'
  | 'correlated'
  | 'running'
  | 'terminal'
  | 'captured'
  | 'rendered'
  | 'failed';

const TRANSITIONS: Readonly<Record<ProjectRunPhase, readonly ProjectRunPhase[]>> = {
  validated: ['authenticated', 'failed'],
  authenticated: ['job_resolved', 'failed'],
  job_resolved: ['capability_checked', 'existing_build_selected', 'failed'],
  capability_checked: ['parameterized_failure', 'baseline_captured', 'failed'],
  parameterized_failure: ['failed'],
  existing_build_selected: ['running', 'failed'],
  baseline_captured: ['submitted', 'failed'],
  submitted: ['correlated', 'failed'],
  correlated: ['running', 'failed'],
  running: ['terminal', 'failed'],
  terminal: ['captured', 'failed'],
  captured: ['rendered', 'failed'],
  rendered: [],
  failed: [],
};

export class ProjectRunState {
  private currentPhase: ProjectRunPhase = 'validated';
  private currentBuild: BuildReference | undefined;
  private failureMessage: string | undefined;
  public readonly identity: ProjectRunIdentity;

  public constructor(identity: ProjectRunIdentity) {
    this.identity = Object.freeze({ ...identity });
  }

  public get phase(): ProjectRunPhase { return this.currentPhase; }
  public get build(): BuildReference | undefined { return this.currentBuild; }
  public get failure(): string | undefined { return this.failureMessage; }

  public transition(next: ProjectRunPhase): void {
    if (!TRANSITIONS[this.currentPhase].includes(next)) {
      throw new Error(`Invalid project run transition: ${this.currentPhase} -> ${next}`);
    }
    this.currentPhase = next;
  }

  public bindBuild(build: BuildReference): void {
    let validUrl = false;
    try {
      const url = new URL(build.url);
      validUrl = ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash;
    } catch {
      validUrl = false;
    }
    if (!Number.isSafeInteger(build.number) || build.number < 1 || !validUrl) {
      throw new Error('Exact Jenkins build identity is invalid');
    }
    if (this.currentBuild !== undefined &&
      (this.currentBuild.number !== build.number || this.currentBuild.url !== build.url)) {
      throw new Error('Exact Jenkins build identity cannot change during a run');
    }
    this.currentBuild = Object.freeze({ ...build });
  }

  public fail(message: string): void {
    if (this.currentPhase === 'rendered' || this.currentPhase === 'failed') {
      throw new Error(`Cannot fail a project run from ${this.currentPhase}`);
    }
    this.failureMessage = message;
    this.currentPhase = 'failed';
  }
}
