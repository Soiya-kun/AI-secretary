import { spawn } from 'node:child_process';
import type { SkillExecutionInput, SkillExecutionResult, SkillRunnerType } from './skill-types.js';

async function runCommand(
  command: string,
  args: string[],
  timeoutSec: number,
  openInNewWindow?: boolean,
): Promise<SkillExecutionResult> {
  return new Promise((resolve) => {
    const stdio: ['ignore', 'pipe', 'pipe'] = ['ignore', 'pipe', 'pipe'];
    const spawnOptions: Parameters<typeof spawn>[2] = openInNewWindow
      ? {
          stdio,
          detached: process.platform === 'win32',
          windowsHide: false,
          shell: process.platform === 'win32',
        }
      : { stdio };

    const child = spawn(command, args, spawnOptions);
    let stdout = '';
    let stderr = '';

    const timeoutHandle = setTimeout(() => {
      child.kill('SIGTERM');
    }, timeoutSec * 1_000);

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on('error', (error: Error) => {
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

    child.on('close', (code: number | null) => {
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

class WorkerPool {
  private active = 0;

  private readonly queue: Array<() => void> = [];

  constructor(private readonly maxParallelism: number) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await task();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.active < this.maxParallelism) {
      this.active += 1;
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      this.queue.push(() => {
        this.active += 1;
        resolve();
      });
    });
  }

  private release(): void {
    this.active -= 1;
    const next = this.queue.shift();
    next?.();
  }
}

const workerPools: Record<SkillRunnerType, WorkerPool> = {
  claude: new WorkerPool(1),
  codex: new WorkerPool(2),
  gemini: new WorkerPool(2),
};

class CliSkillRunner implements SkillRunner {
  constructor(private readonly runnerType: SkillRunnerType) {}

  async run(input: SkillExecutionInput): Promise<SkillExecutionResult> {
    const pool = workerPools[this.runnerType];
    return pool.run(() =>
      runCommand(input.command, input.args, input.timeoutSec, input.openInNewWindow),
    );
  }
}

export function createRunner(runnerType: SkillRunnerType): SkillRunner {
  return new CliSkillRunner(runnerType);
}
