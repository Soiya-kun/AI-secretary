import { JobQueue } from './job-queue.js';
import { Scheduler, type SchedulerTask } from './scheduler.js';
import type { JobExecutor, JobSnapshot, RuntimeJob, RuntimeJobInput } from './types.js';

const MAX_RETRY_COUNT = 3;

export interface AgentRuntime {
  enqueueManual: (commandType: string, payload: Record<string, unknown>) => string;
  enqueueRemote: (commandType: string, payload: Record<string, unknown>) => string;
  registerScheduledCommand: (input: { name: string; intervalMs: number; commandType: string; payload: Record<string, unknown> }) => void;
  cancelJob: (jobId: string) => boolean;
  getJob: (jobId: string) => JobSnapshot | undefined;
  processNext: () => Promise<void>;
  shutdown: () => void;
}

function snapshot(job: RuntimeJob): JobSnapshot {
  return {
    id: job.id,
    commandType: job.commandType,
    source: job.source,
    state: job.state,
    attempts: job.attempts,
  };
}

export function createAgentRuntime(executor: JobExecutor): AgentRuntime {
  const queue = new JobQueue();
  const scheduler = new Scheduler();
  const jobs = new Map<string, RuntimeJob>();
  let runningJobId: string | undefined;

  const enqueue = (input: RuntimeJobInput): string => {
    const job = queue.enqueue(input);
    jobs.set(job.id, job);
    return job.id;
  };

  const registerScheduledCommand = (input: {
    name: string;
    intervalMs: number;
    commandType: string;
    payload: Record<string, unknown>;
  }): void => {
    const task: SchedulerTask = {
      name: input.name,
      intervalMs: input.intervalMs,
      run: async () => {
        enqueue({
          commandType: input.commandType,
          payload: input.payload,
          source: 'scheduled',
        });
      },
    };

    scheduler.register(task);
  };

  return {
    enqueueManual: (commandType, payload) => enqueue({ commandType, payload, source: 'manual' }),
    enqueueRemote: (commandType, payload) => enqueue({ commandType, payload, source: 'remote' }),
    registerScheduledCommand,
    cancelJob: (jobId) => {
      const job = jobs.get(jobId);
      if (!job) {
        return false;
      }

      if (runningJobId === jobId) {
        job.state = 'canceled';
        return true;
      }

      const removed = queue.remove(jobId);
      if (!removed) {
        return false;
      }
      removed.state = 'canceled';
      return true;
    },
    getJob: (jobId) => {
      const job = jobs.get(jobId);
      return job ? snapshot(job) : undefined;
    },
    processNext: async () => {
      if (runningJobId) {
        return;
      }

      const job = queue.dequeue();
      if (!job || job.state === 'canceled') {
        return;
      }

      runningJobId = job.id;
      job.state = 'running';

      try {
        while (job.attempts < MAX_RETRY_COUNT) {
          job.attempts += 1;
          const result = await executor.execute({ job, attempt: job.attempts });
          if (result.ok) {
            job.state = 'succeeded';
            return;
          }
        }

        job.state = 'failed';
      } finally {
        runningJobId = undefined;
      }
    },
    shutdown: () => {
      scheduler.stopAll();
    },
  };
}
