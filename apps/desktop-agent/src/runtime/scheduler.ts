export interface SchedulerTask {
  name: string;
  intervalMs: number;
  run: () => Promise<void>;
}

export class Scheduler {
  private readonly timerIds = new Map<string, NodeJS.Timeout>();

  register(task: SchedulerTask): void {
    if (this.timerIds.has(task.name)) {
      throw new Error(`Task already registered: ${task.name}`);
    }

    const timerId = setInterval(() => {
      void task.run();
    }, task.intervalMs);

    this.timerIds.set(task.name, timerId);
  }

  stop(taskName: string): void {
    const timerId = this.timerIds.get(taskName);
    if (!timerId) {
      return;
    }

    clearInterval(timerId);
    this.timerIds.delete(taskName);
  }

  stopAll(): void {
    for (const [taskName] of this.timerIds) {
      this.stop(taskName);
    }
  }
}
