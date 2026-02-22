import assert from 'node:assert/strict';
import test from 'node:test';
import { createRemoteCommandClient } from './remote-command-client.js';

test('remote command client enqueues new queued commands', async () => {
  const enqueued: Array<{ commandType: string; payload: Record<string, unknown> }> = [];
  let fetchCount = 0;

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    fetchCount += 1;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        commands: [
          {
            command_id: 'cmd-1',
            command_type: 'devtask.submit',
            payload: { repository: 'owner/repo', task: 'test' },
            status: 'queued',
          },
        ],
      }),
    } as Response;
  }) as typeof fetch;

  const client = createRemoteCommandClient(
    {
      baseUrl: 'https://example.com',
      pollIntervalMs: 5,
    },
    {
      enqueueRemote: (commandType, payload) => {
        enqueued.push({ commandType, payload });
        return 'job-1';
      },
    },
  );

  client.start();
  await new Promise((resolve) => setTimeout(resolve, 20));
  client.stop();
  globalThis.fetch = originalFetch;

  assert.ok(fetchCount >= 1);
  assert.equal(enqueued.length, 1);
  assert.equal(enqueued[0]?.commandType, 'devtask.submit');
  assert.deepEqual(enqueued[0]?.payload, { repository: 'owner/repo', task: 'test' });
});

test('remote command client does not enqueue duplicate command ids across polls', async () => {
  const enqueued: string[] = [];

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    ({
      ok: true,
      status: 200,
      json: async () => ({
        commands: [
          {
            command_id: 'cmd-duplicate',
            command_type: 'note.capture',
            payload: { content: 'same' },
            status: 'queued',
          },
        ],
      }),
    }) as Response) as typeof fetch;

  const client = createRemoteCommandClient(
    {
      baseUrl: 'https://example.com',
      pollIntervalMs: 5,
    },
    {
      enqueueRemote: (commandType) => {
        enqueued.push(commandType);
        return 'job-2';
      },
    },
  );

  client.start();
  await new Promise((resolve) => setTimeout(resolve, 25));
  client.stop();
  globalThis.fetch = originalFetch;

  assert.equal(enqueued.length, 1);
  assert.equal(enqueued[0], 'note.capture');
});
