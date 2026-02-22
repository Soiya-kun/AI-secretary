import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import Database from 'better-sqlite3';

export interface AuditLogInput {
  commandId: string;
  skill: string;
  result: 'succeeded' | 'failed';
  retryCount: number;
}

export interface AgentDatabase {
  connection: Database.Database;
  initialize: () => void;
  insertAuditLog: (input: AuditLogInput) => void;
}

function ensureDirectory(sqlitePath: string): string {
  const absolutePath = resolve(sqlitePath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  return absolutePath;
}

export function createAgentDatabase(sqlitePath: string): AgentDatabase {
  const db = new Database(ensureDirectory(sqlitePath));

  return {
    connection: db,
    initialize: () => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS audit_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          audit_id TEXT NOT NULL,
          command_id TEXT,
          skill TEXT,
          result TEXT NOT NULL,
          retry_count INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS command_requests (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          command_id TEXT NOT NULL UNIQUE,
          command_type TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          status TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS git_exports (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          command_id TEXT,
          repo TEXT NOT NULL,
          branch TEXT NOT NULL,
          commit_hash TEXT,
          export_status TEXT NOT NULL,
          exported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      `);
    },
    insertAuditLog: (input) => {
      const statement = db.prepare(`
        INSERT INTO audit_logs (audit_id, command_id, skill, result, retry_count)
        VALUES (@auditId, @commandId, @skill, @result, @retryCount)
      `);

      statement.run({
        auditId: randomUUID(),
        commandId: input.commandId,
        skill: input.skill,
        result: input.result,
        retryCount: input.retryCount,
      });
    },
  };
}
