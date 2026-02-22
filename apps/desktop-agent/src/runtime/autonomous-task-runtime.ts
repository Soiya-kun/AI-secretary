import { randomUUID } from 'node:crypto';

export type AutonomousTaskState = 'queued' | 'running' | 'checkpointed' | 'succeeded' | 'failed';

export interface AutonomousTaskInput {
  commandType: string;
  payload: Record<string, unknown>;
  priority: number;
  handoffFromTaskIds?: string[];
}

export interface AutonomousTaskCheckpoint {
  cursor: string;
  progress: number;
  metadata?: Record<string, unknown>;
}

export interface AutonomousTaskRecord extends AutonomousTaskInput {
  id: string;
  createdAt: number;
  updatedAt: number;
  attempts: number;
  state: AutonomousTaskState;
  artifacts: string[];
  checkpoint?: AutonomousTaskCheckpoint;
}

export interface AutonomousTaskExecutionContext {
  task: AutonomousTaskRecord;
  inheritedArtifacts: string[];
}

export type AutonomousTaskExecutionResult =
  | { status: 'succeeded'; artifacts?: string[] }
  | { status: 'checkpointed'; checkpoint: AutonomousTaskCheckpoint; artifacts?: string[] }
  | { status: 'failed' };

export interface AutonomousTaskExecutor {
  execute: (context: AutonomousTaskExecutionContext) => Promise<AutonomousTaskExecutionResult>;
}

export interface AutonomousTaskRuntime {
  enqueue: (input: AutonomousTaskInput) => string;
  resumeFromStandby: () => void;
  runOnce: () => Promise<void>;
  getTask: (taskId: string) => AutonomousTaskRecord | undefined;
  getRunningCount: () => number;
}

export function createAutonomousTaskRuntime(
  executor: AutonomousTaskExecutor,
  options?: {
    maxConcurrent?: number;
    startInStandby?: boolean;
  },
): AutonomousTaskRuntime {
  const maxConcurrent = options?.maxConcurrent ?? 2;
  const tasks = new Map<string, AutonomousTaskRecord>();
  const queuedTaskIds: string[] = [];
  const runningTaskIds = new Set<string>();
  let standby = options?.startInStandby ?? true;

  const sortQueue = (): void => {
    queuedTaskIds.sort((leftId, rightId) => {
      const left = tasks.get(leftId);
      const right = tasks.get(rightId);
      if (!left || !right) {
        return 0;
      }
      if (left.priority !== right.priority) {
        return right.priority - left.priority;
      }
      return left.createdAt - right.createdAt;
    });
  };

  const collectHandoffArtifacts = (task: AutonomousTaskRecord): string[] => {
    if (!task.handoffFromTaskIds || task.handoffFromTaskIds.length === 0) {
      return [];
    }

    return task.handoffFromTaskIds.flatMap((handoffTaskId) => {
      const dependencyTask = tasks.get(handoffTaskId);
      if (!dependencyTask || dependencyTask.state !== 'succeeded') {
        return [];
      }
      return dependencyTask.artifacts;
    });
  };

  const executeTask = async (taskId: string): Promise<void> => {
    const task = tasks.get(taskId);
    if (!task) {
      return;
    }

    task.state = 'running';
    task.attempts += 1;
    task.updatedAt = Date.now();
    runningTaskIds.add(task.id);

    try {
      const result = await executor.execute({
        task,
        inheritedArtifacts: collectHandoffArtifacts(task),
      });

      task.updatedAt = Date.now();

      if (result.status === 'succeeded') {
        task.state = 'succeeded';
        task.artifacts = result.artifacts ?? task.artifacts;
        task.checkpoint = undefined;
        return;
      }

      if (result.status === 'checkpointed') {
        task.state = 'checkpointed';
        task.checkpoint = result.checkpoint;
        task.artifacts = result.artifacts ?? task.artifacts;
        queuedTaskIds.push(task.id);
        sortQueue();
        return;
      }

      task.state = 'failed';
    } finally {
      runningTaskIds.delete(task.id);
    }
  };

  return {
    enqueue: (input) => {
      const task: AutonomousTaskRecord = {
        ...input,
        id: randomUUID(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        attempts: 0,
        state: 'queued',
        artifacts: [],
      };
      tasks.set(task.id, task);
      queuedTaskIds.push(task.id);
      sortQueue();
      return task.id;
    },
    resumeFromStandby: () => {
      standby = false;
    },
    runOnce: async () => {
      if (standby) {
        return;
      }

      const availableSlots = maxConcurrent - runningTaskIds.size;
      if (availableSlots <= 0) {
        return;
      }

      const selectedTaskIds = queuedTaskIds.splice(0, availableSlots);
      await Promise.all(selectedTaskIds.map(async (taskId) => executeTask(taskId)));
    },
    getTask: (taskId) => {
      const task = tasks.get(taskId);
      return task ? { ...task } : undefined;
    },
    getRunningCount: () => runningTaskIds.size,
  };
}
