export type JobSource = 'manual' | 'remote' | 'scheduled';

export type JobState = 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';

export interface RuntimeJobInput {
  commandType: string;
  payload: Record<string, unknown>;
  source: JobSource;
}

export interface RuntimeJob extends RuntimeJobInput {
  id: string;
  priority: number;
  attempts: number;
  createdAt: number;
  state: JobState;
}

export interface JobExecutionContext {
  job: RuntimeJob;
  attempt: number;
}

export interface JobExecutionResult {
  ok: boolean;
  message?: string;
}

export interface JobExecutor {
  execute: (context: JobExecutionContext) => Promise<JobExecutionResult>;
}

export interface JobSnapshot {
  id: string;
  commandType: string;
  source: JobSource;
  state: JobState;
  attempts: number;
}
