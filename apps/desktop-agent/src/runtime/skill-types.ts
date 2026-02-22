export type SkillRunnerType = 'claude' | 'codex' | 'gemini';

export interface SkillManifest {
  name: string;
  owner: string;
  commandType: string;
  runner: SkillRunnerType;
  command: string;
  args: string[];
  timeoutSec: number;
  openInNewWindow?: boolean;
  retryPolicy: {
    maxAttempts: number;
  };
}

export interface SkillExecutionInput {
  skillName: string;
  command: string;
  args: string[];
  timeoutSec: number;
  openInNewWindow?: boolean;
  payload: Record<string, unknown>;
}

export interface SkillExecutionResult {
  status: 'succeeded' | 'failed';
  exitCode: number;
  stdout: string;
  stderr: string;
  output: string;
  artifacts: string[];
}
