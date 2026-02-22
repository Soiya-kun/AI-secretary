import { spawn } from 'node:child_process';
import type { SkillExecutionInput, SkillExecutionResult, SkillRunnerType } from './skill-types.js';

async function runCommand(command: string, args: string[]): Promise<SkillExecutionResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      resolve({
        status: 'failed',
        output: error.message,
        artifacts: [],
      });
    });

    child.on('close', (code) => {
      const output = [stdout.trim(), stderr.trim()].filter(Boolean).join('\n');
      resolve({
        status: code === 0 ? 'succeeded' : 'failed',
        output,
        artifacts: [],
      });
    });
  });
}

export interface SkillRunner {
  run: (input: SkillExecutionInput) => Promise<SkillExecutionResult>;
}

class CliSkillRunner implements SkillRunner {
  async run(input: SkillExecutionInput): Promise<SkillExecutionResult> {
    return runCommand(input.command, input.args);
  }
}

export function createRunner(runnerType: SkillRunnerType): SkillRunner {
  void runnerType;
  return new CliSkillRunner();
}
