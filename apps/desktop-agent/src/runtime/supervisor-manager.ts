import { spawn } from 'node:child_process';

export interface SupervisorProcess {
  isAlive: () => boolean;
  kill: () => void;
  onExit: (listener: (exitCode: number | null) => void) => void;
}

export interface SupervisorManagerConfig {
  command: string;
  args: string[];
  healthcheckIntervalMs: number;
  restartDelayMs: number;
  maxConsecutiveFailures: number;
}

export interface SupervisorManager {
  start: () => void;
  stop: () => void;
}

export function createSupervisorProcess(command: string, args: string[]): SupervisorProcess {
  const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });

  return {
    isAlive: () => child.exitCode === null,
    kill: () => {
      if (child.exitCode === null) {
        child.kill('SIGTERM');
      }
    },
    onExit: (listener) => {
      child.on('close', (code) => {
        listener(code);
      });
    },
  };
}

export function createSupervisorManager(
  config: SupervisorManagerConfig,
  hooks: {
    onDegraded: (reason: string) => void;
    createProcess?: (command: string, args: string[]) => SupervisorProcess;
  },
): SupervisorManager {
  const createProcess = hooks.createProcess ?? createSupervisorProcess;
  let currentProcess: SupervisorProcess | undefined;
  let healthcheckTimer: ReturnType<typeof setInterval> | undefined;
  let restartTimer: ReturnType<typeof setTimeout> | undefined;
  let stopping = false;
  let consecutiveFailures = 0;

  const launch = (): void => {
    if (stopping || currentProcess) {
      return;
    }

    const process = createProcess(config.command, config.args);
    currentProcess = process;

    process.onExit(() => {
      currentProcess = undefined;
      if (stopping) {
        return;
      }

      consecutiveFailures += 1;
      if (consecutiveFailures >= config.maxConsecutiveFailures) {
        hooks.onDegraded(
          `agent.degraded: supervisor restart failed ${consecutiveFailures} times consecutively`,
        );
        return;
      }

      restartTimer = setTimeout(() => {
        restartTimer = undefined;
        launch();
      }, config.restartDelayMs);
    });
  };

  return {
    start: () => {
      stopping = false;
      launch();

      if (healthcheckTimer) {
        return;
      }

      healthcheckTimer = setInterval(() => {
        if (stopping) {
          return;
        }

        if (!currentProcess || !currentProcess.isAlive()) {
          launch();
          return;
        }

        consecutiveFailures = 0;
      }, config.healthcheckIntervalMs);
    },
    stop: () => {
      stopping = true;
      if (healthcheckTimer) {
        clearInterval(healthcheckTimer);
        healthcheckTimer = undefined;
      }
      if (restartTimer) {
        clearTimeout(restartTimer);
        restartTimer = undefined;
      }
      currentProcess?.kill();
      currentProcess = undefined;
    },
  };
}
