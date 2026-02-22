import assert from 'node:assert/strict';
import test from 'node:test';
import { createWorkerOrchestrator } from './worker-orchestrator.js';

test('createLaunchRequest converts skill into claude-supervised worker request', () => {
  const orchestrator = createWorkerOrchestrator();
  const request = orchestrator.createLaunchRequest({
    skill: {
      name: 'devtask_submit',
      owner: 'dev-productivity',
      commandType: 'devtask.submit',
      runner: 'codex',
      command: 'codex',
      args: ['run', '--json'],
      timeoutSec: 180,
      retryPolicy: { maxAttempts: 2 },
    },
    payload: { repository: 'owner/repo', task: 'add tests' },
  });

  assert.equal(request.supervisor, 'claude');
  assert.equal(request.workerType, 'codex');
  assert.equal(request.skillName, 'devtask_submit');
  assert.equal(request.commandType, 'devtask.submit');
  assert.equal(request.timeoutSec, 180);
  assert.deepEqual(request.payload, { repository: 'owner/repo', task: 'add tests' });
});
