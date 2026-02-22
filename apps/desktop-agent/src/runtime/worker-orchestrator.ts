import type { SkillManifest, SkillRunnerType } from './skill-types.js';

export interface WorkerLaunchRequest {
  supervisor: 'claude';
  workerType: SkillRunnerType;
  skillName: string;
  commandType: string;
  command: string;
  args: string[];
  payload: Record<string, unknown>;
  timeoutSec: number;
  openInNewWindow?: boolean;
}

export interface WorkerOrchestrator {
  createLaunchRequest: (input: {
    skill: SkillManifest;
    payload: Record<string, unknown>;
  }) => WorkerLaunchRequest;
}

export function createWorkerOrchestrator(): WorkerOrchestrator {
  return {
    createLaunchRequest: ({ skill, payload }) => ({
      supervisor: 'claude',
      workerType: skill.runner,
      skillName: skill.name,
      commandType: skill.commandType,
      command: skill.command,
      args: skill.args,
      payload,
      timeoutSec: skill.timeoutSec,
      openInNewWindow: skill.openInNewWindow,
    }),
  };
}
