import assert from 'node:assert/strict';
import test from 'node:test';
import { createRunner } from './skill-runners.js';

test('codex runner pool limits parallelism to 2', async () => {
  const runner = createRunner('codex');
  const startedAt = Date.now();

  const runTask = () =>
    runner.run({
      skillName: 'pool-test',
      command: 'node',
      args: ['-e', 'setTimeout(() => process.exit(0), 120)'],
      timeoutSec: 3,
      payload: {},
    });

  const [r1, r2, r3] = await Promise.all([runTask(), runTask(), runTask()]);
  const elapsed = Date.now() - startedAt;

  assert.equal(r1.status, 'succeeded');
  assert.equal(r2.status, 'succeeded');
  assert.equal(r3.status, 'succeeded');
  assert.ok(elapsed >= 200);
});

test('gemini runner pool limits parallelism to 2', async () => {
  const runner = createRunner('gemini');
  const startedAt = Date.now();

  const runTask = () =>
    runner.run({
      skillName: 'pool-test',
      command: 'node',
      args: ['-e', 'setTimeout(() => process.exit(0), 120)'],
      timeoutSec: 3,
      payload: {},
    });

  const [r1, r2, r3] = await Promise.all([runTask(), runTask(), runTask()]);
  const elapsed = Date.now() - startedAt;

  assert.equal(r1.status, 'succeeded');
  assert.equal(r2.status, 'succeeded');
  assert.equal(r3.status, 'succeeded');
  assert.ok(elapsed >= 200);
});
