import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import { loadSkillManifest } from './skill-manifest-loader.js';
import { createSkillRuntime } from './skill-runtime.js';

test('loadSkillManifest validates extended schema fields', () => {
  const dir = mkdtempSync(resolve(tmpdir(), 'skill-manifest-'));
  const path = resolve(dir, 'skills.json');
  writeFileSync(
    path,
    JSON.stringify({
      skills: [
        {
          name: 'devtask_submit',
          owner: 'dev-productivity',
          commandType: 'devtask.submit',
          runner: 'codex',
          command: 'echo',
          args: ['ok'],
          timeoutSec: 10,
          retryPolicy: {
            maxAttempts: 3,
          },
        },
      ],
    }),
  );

  const manifest = loadSkillManifest(path);
  assert.equal(manifest.skills[0]?.owner, 'dev-productivity');
  assert.equal(manifest.skills[0]?.timeoutSec, 10);
  assert.equal(manifest.skills[0]?.retryPolicy.maxAttempts, 3);
});

test('createSkillRuntime returns unsupported_command when commandType is unknown', async () => {
  const dir = mkdtempSync(resolve(tmpdir(), 'skill-runtime-'));
  const path = resolve(dir, 'skills.json');
  writeFileSync(path, JSON.stringify({ skills: [] }));

  const runtime = createSkillRuntime(path);
  const response = await runtime.executeByCommandType({
    commandType: 'missing.command',
    payload: {},
  });

  assert.equal(response.skill.name, 'unsupported_command');
  assert.equal(response.result.status, 'failed');
  assert.equal(response.result.exitCode, 1);
  runtime.close();
});
