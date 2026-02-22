import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import { createAgentRuntime } from './agent-runtime.js';
import { createRemoteCommandClient } from './remote-command-client.js';
import { createSkillRuntime } from './skill-runtime.js';

test('mobile-cloud-desktop-worker flow enqueues remote command and executes worker', async () => {
  const dir = mkdtempSync(resolve(tmpdir(), 'remote-e2e-'));
  const manifestPath = resolve(dir, 'skills.json');
  writeFileSync(
    manifestPath,
    JSON.stringify({
      skills: [
        {
          name: 'devtask_submit',
          owner: 'dev-productivity',
          commandType: 'devtask.submit',
          runner: 'codex',
          command: 'node',
          args: ['-e', 'console.log("ok")'],
          timeoutSec: 3,
          retryPolicy: { maxAttempts: 1 },
        },
      ],
    }),
  );

  const skillRuntime = createSkillRuntime(manifestPath);
  let executedMessage = '';
  const runtime = createAgentRuntime({
    execute: async ({ job }) => {
      const { result } = await skillRuntime.executeByCommandType({
        commandType: job.commandType,
        payload: job.payload,
      });
      executedMessage = result.output;
      return { ok: result.status === 'succeeded', message: result.output };
    },
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    ({
      ok: true,
      status: 200,
      json: async () => ({
        commands: [
          {
            command_id: 'cmd-mobile-1',
            command_type: 'devtask.submit',
            payload: { repository: 'owner/repo', task: 'e2e' },
            status: 'queued',
          },
        ],
      }),
    }) as Response) as typeof fetch;

  const remoteClient = createRemoteCommandClient(
    {
      baseUrl: 'https://example.com',
      pollIntervalMs: 5,
    },
    {
      enqueueRemote: (commandType, payload) => runtime.enqueueRemote(commandType, payload),
    },
  );

  remoteClient.start();
  await new Promise((resolve) => setTimeout(resolve, 25));
  await runtime.processNext();

  assert.equal(executedMessage, 'ok');

  remoteClient.stop();
  globalThis.fetch = originalFetch;
  skillRuntime.close();
  runtime.shutdown();
});
