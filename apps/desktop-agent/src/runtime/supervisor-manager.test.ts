import assert from 'node:assert/strict';
import test from 'node:test';
import { createSupervisorManager, type SupervisorProcess } from './supervisor-manager.js';

class FakeSupervisorProcess implements SupervisorProcess {
  private alive = true;
  private exitListeners: Array<(exitCode: number | null) => void> = [];

  isAlive(): boolean {
    return this.alive;
  }

  kill(): void {
    this.alive = false;
  }

  onExit(listener: (exitCode: number | null) => void): void {
    this.exitListeners.push(listener);
  }

  crash(code = 1): void {
    this.alive = false;
    for (const listener of this.exitListeners) {
      listener(code);
    }
  }
}

test('supervisor manager restarts crashed supervisor within restart delay', async () => {
  const processes: FakeSupervisorProcess[] = [];

  const manager = createSupervisorManager(
    {
      command: 'claude',
      args: ['supervisor'],
      healthcheckIntervalMs: 60_000,
      restartDelayMs: 10,
      maxConsecutiveFailures: 3,
    },
    {
      onDegraded: () => {},
      createProcess: () => {
        const process = new FakeSupervisorProcess();
        processes.push(process);
        return process;
      },
    },
  );

  manager.start();
  assert.equal(processes.length, 1);

  processes[0]?.crash();

  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(processes.length, 2);
  manager.stop();
});

test('supervisor manager reports degraded after consecutive failures', async () => {
  const processes: FakeSupervisorProcess[] = [];
  const degraded: string[] = [];

  const manager = createSupervisorManager(
    {
      command: 'claude',
      args: ['supervisor'],
      healthcheckIntervalMs: 60_000,
      restartDelayMs: 5,
      maxConsecutiveFailures: 3,
    },
    {
      onDegraded: (reason) => {
        degraded.push(reason);
      },
      createProcess: () => {
        const process = new FakeSupervisorProcess();
        processes.push(process);
        return process;
      },
    },
  );

  manager.start();

  processes[0]?.crash();
  await new Promise((resolve) => setTimeout(resolve, 10));
  processes[1]?.crash();
  await new Promise((resolve) => setTimeout(resolve, 10));
  processes[2]?.crash();
  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.equal(degraded.length, 1);
  assert.match(degraded[0] ?? '', /agent\.degraded/);
  manager.stop();
});
