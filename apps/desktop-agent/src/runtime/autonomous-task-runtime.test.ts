import assert from 'node:assert/strict';
import test from 'node:test';
import { createAutonomousTaskRuntime } from './autonomous-task-runtime.js';

test('resumeFromStandby starts autonomous processing from waiting state', async () => {
  let calls = 0;
  const runtime = createAutonomousTaskRuntime({
    execute: async () => {
      calls += 1;
      return { status: 'succeeded' };
    },
  });

  const taskId = runtime.enqueue({
    commandType: 'devtask.submit',
    payload: { task: 'add tests' },
    priority: 100,
  });

  await runtime.runOnce();
  assert.equal(calls, 0);
  assert.equal(runtime.getTask(taskId)?.state, 'queued');

  runtime.resumeFromStandby();
  await runtime.runOnce();

  assert.equal(calls, 1);
  assert.equal(runtime.getTask(taskId)?.state, 'succeeded');
});

test('priority scheduling executes higher-priority tasks first within parallel limit', async () => {
  const executedCommandTypes: string[] = [];
  const runtime = createAutonomousTaskRuntime(
    {
      execute: async ({ task }) => {
        executedCommandTypes.push(task.commandType);
        return { status: 'succeeded' };
      },
    },
    { maxConcurrent: 2 },
  );

  runtime.enqueue({ commandType: 'devtask.low', payload: {}, priority: 10 });
  runtime.enqueue({ commandType: 'meeting.high', payload: {}, priority: 300 });
  runtime.enqueue({ commandType: 'note.mid', payload: {}, priority: 200 });

  runtime.resumeFromStandby();
  await runtime.runOnce();

  assert.deepEqual(executedCommandTypes, ['meeting.high', 'note.mid']);
});

test('artifact handoff passes predecessor outputs to downstream tasks', async () => {
  const inheritedArtifactsByTask: Record<string, string[]> = {};
  const runtime = createAutonomousTaskRuntime(
    {
      execute: async ({ task, inheritedArtifacts }) => {
        inheritedArtifactsByTask[task.commandType] = inheritedArtifacts;
        if (task.commandType === 'task.producer') {
          return { status: 'succeeded', artifacts: ['artifacts/summary.md'] };
        }
        return { status: 'succeeded' };
      },
    },
    { maxConcurrent: 1 },
  );

  const producerId = runtime.enqueue({
    commandType: 'task.producer',
    payload: {},
    priority: 200,
  });

  runtime.enqueue({
    commandType: 'task.consumer',
    payload: {},
    priority: 100,
    handoffFromTaskIds: [producerId],
  });

  runtime.resumeFromStandby();
  await runtime.runOnce();
  await runtime.runOnce();

  assert.deepEqual(inheritedArtifactsByTask['task.consumer'], ['artifacts/summary.md']);
});

test('checkpointed tasks keep intermediate state and are resumed on next run', async () => {
  let executionCount = 0;
  const runtime = createAutonomousTaskRuntime({
    execute: async ({ task }) => {
      executionCount += 1;
      if (executionCount === 1) {
        return {
          status: 'checkpointed',
          checkpoint: {
            cursor: 'chunk-2',
            progress: 50,
          },
        };
      }

      assert.deepEqual(task.checkpoint, {
        cursor: 'chunk-2',
        progress: 50,
      });
      return {
        status: 'succeeded',
        artifacts: ['artifacts/final.txt'],
      };
    },
  });

  const taskId = runtime.enqueue({
    commandType: 'task.long-running',
    payload: {},
    priority: 100,
  });

  runtime.resumeFromStandby();
  await runtime.runOnce();

  const checkpointedTask = runtime.getTask(taskId);
  assert.equal(checkpointedTask?.state, 'checkpointed');
  assert.deepEqual(checkpointedTask?.checkpoint, {
    cursor: 'chunk-2',
    progress: 50,
  });

  await runtime.runOnce();

  const completedTask = runtime.getTask(taskId);
  assert.equal(completedTask?.state, 'succeeded');
  assert.equal(completedTask?.checkpoint, undefined);
  assert.deepEqual(completedTask?.artifacts, ['artifacts/final.txt']);
});
