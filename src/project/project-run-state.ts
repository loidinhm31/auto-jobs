import type { ProjectRunIdentity } from './project-types.js';

export type ProjectRunPhase =
  | 'configured'
  | 'authenticated'
  | 'job_opened'
  | 'links_discovered'
  | 'captured'
  | 'rendered'
  | 'failed';

const TRANSITIONS: Readonly<Record<ProjectRunPhase, readonly ProjectRunPhase[]>> = {
  configured: ['authenticated', 'failed'],
  authenticated: ['job_opened', 'failed'],
  job_opened: ['links_discovered', 'failed'],
  links_discovered: ['captured', 'failed'],
  captured: ['rendered', 'failed'],
  rendered: [],
  failed: [],
};

export class ProjectRunState {
  private currentPhase: ProjectRunPhase = 'configured';
  private failureMessage: string | undefined;
  public readonly identity: ProjectRunIdentity;

  public constructor(identity: ProjectRunIdentity) {
    this.identity = Object.freeze({ ...identity });
  }

  public get phase(): ProjectRunPhase { return this.currentPhase; }
  public get failure(): string | undefined { return this.failureMessage; }

  public transition(next: ProjectRunPhase): void {
    if (!TRANSITIONS[this.currentPhase].includes(next)) {
      throw new Error(`Invalid project run transition: ${this.currentPhase} -> ${next}`);
    }
    this.currentPhase = next;
  }

  public fail(message: string): void {
    if (this.currentPhase === 'rendered' || this.currentPhase === 'failed') {
      throw new Error(`Cannot fail a project run from ${this.currentPhase}`);
    }
    this.failureMessage = message;
    this.currentPhase = 'failed';
  }
}
