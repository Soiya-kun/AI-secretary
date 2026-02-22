import { randomUUID } from 'node:crypto';
import type { RuntimeJob, RuntimeJobInput } from './types.js';

const PRIORITY_BY_PREFIX: Array<{ prefix: string; value: number }> = [
  { prefix: 'meeting.', value: 300 },
  { prefix: 'note.', value: 200 },
  { prefix: 'devtask.', value: 100 },
];

function resolvePriority(commandType: string): number {
  const entry = PRIORITY_BY_PREFIX.find((item) => commandType.startsWith(item.prefix));
  return entry?.value ?? 0;
}

export class JobQueue {
  private readonly queue: RuntimeJob[] = [];

  enqueue(input: RuntimeJobInput): RuntimeJob {
    const job: RuntimeJob = {
      ...input,
      id: randomUUID(),
      priority: resolvePriority(input.commandType),
      attempts: 0,
      createdAt: Date.now(),
      state: 'queued',
    };

    this.queue.push(job);
    this.queue.sort((a, b) => {
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      return a.createdAt - b.createdAt;
    });

    return job;
  }

  dequeue(): RuntimeJob | undefined {
    return this.queue.shift();
  }

  remove(jobId: string): RuntimeJob | undefined {
    const index = this.queue.findIndex((job) => job.id === jobId);
    if (index === -1) {
      return undefined;
    }

    const [job] = this.queue.splice(index, 1);
    return job;
  }

  getSize(): number {
    return this.queue.length;
  }
}
