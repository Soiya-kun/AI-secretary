import { spawn } from 'node:child_process';
import type { SkillExecutionInput, SkillExecutionResult, SkillRunnerType } from './skill-types.js';

async function runCommand(command: string, args: string[], timeoutSec: number): Promise<SkillExecutionResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    const timeoutHandle = setTimeout(() => {
      child.kill('SIGTERM');
    }, timeoutSec * 1_000);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      clearTimeout(timeoutHandle);
      resolve({
        status: 'failed',
        exitCode: 1,
        stdout: '',
        stderr: error.message,
        output: error.message,
        artifacts: [],
      });
    });

    child.on('close', (code) => {
      clearTimeout(timeoutHandle);
      const trimmedStdout = stdout.trim();
      const trimmedStderr = stderr.trim();
      const output = [trimmedStdout, trimmedStderr].filter(Boolean).join('\n');
      resolve({
        status: code === 0 ? 'succeeded' : 'failed',
        exitCode: code ?? 1,
        stdout: trimmedStdout,
        stderr: trimmedStderr,
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
    return runCommand(input.command, input.args, input.timeoutSec);
  }
}

export function createRunner(runnerType: SkillRunnerType): SkillRunner {
  void runnerType;
  return new CliSkillRunner();
}
