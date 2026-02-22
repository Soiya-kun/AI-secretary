export type SkillRunnerType = 'claude' | 'codex' | 'gemini';

export interface SkillManifest {
  name: string;
  commandType: string;
  runner: SkillRunnerType;
  command: string;
  args: string[];
}

export interface SkillExecutionInput {
  skillName: string;
  command: string;
  args: string[];
  payload: Record<string, unknown>;
}

export interface SkillExecutionResult {
  status: 'succeeded' | 'failed';
  output: string;
  artifacts: string[];
}
