import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createAgentDatabase } from './db.js';

function createTempDatabase() {
  const dir = mkdtempSync(join(tmpdir(), 'ai-secretary-db-test-'));
  const database = createAgentDatabase(join(dir, 'agent.sqlite'));
  database.initialize();
  return database;
}

test('ensureAuditLogWritten inserts an audit log row', () => {
  const database = createTempDatabase();

  database.ensureAuditLogWritten({
    commandId: 'cmd-1',
    skill: 'note.capture',
    result: 'succeeded',
    retryCount: 1,
  });

  const row = database.connection
    .prepare('SELECT command_id AS commandId, skill, result, retry_count AS retryCount FROM audit_logs WHERE command_id = ?')
    .get('cmd-1') as { commandId: string; skill: string; result: string; retryCount: number } | undefined;

  assert.ok(row);
  assert.equal(row.commandId, 'cmd-1');
  assert.equal(row.skill, 'note.capture');
  assert.equal(row.result, 'succeeded');
  assert.equal(row.retryCount, 1);
});

test('calculateAuditLogCoverage returns zero missing rate when all commands are logged', () => {
  const database = createTempDatabase();

  database.ensureAuditLogWritten({
    commandId: 'cmd-1',
    skill: 'note.capture',
    result: 'succeeded',
    retryCount: 1,
  });
  database.ensureAuditLogWritten({
    commandId: 'cmd-2',
    skill: 'meeting.join.now',
    result: 'failed',
    retryCount: 2,
  });

  const coverage = database.calculateAuditLogCoverage(['cmd-1', 'cmd-2']);

  assert.equal(coverage.totalCommands, 2);
  assert.equal(coverage.loggedCommands, 2);
  assert.equal(coverage.missingRate, 0);
  assert.deepEqual(coverage.missingCommands, []);
});

test('calculateAuditLogCoverage reports missing commands', () => {
  const database = createTempDatabase();

  database.ensureAuditLogWritten({
    commandId: 'cmd-1',
    skill: 'note.capture',
    result: 'succeeded',
    retryCount: 1,
  });

  const coverage = database.calculateAuditLogCoverage(['cmd-1', 'cmd-2', 'cmd-3']);

  assert.equal(coverage.totalCommands, 3);
  assert.equal(coverage.loggedCommands, 1);
  assert.equal(coverage.missingRate, 2 / 3);
  assert.deepEqual(coverage.missingCommands, ['cmd-2', 'cmd-3']);
});
