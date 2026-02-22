import { app } from 'electron';
import { loadAgentConfig } from './config.js';
import { createAgentDatabase } from './db.js';
import { createAgentRuntime } from './runtime/agent-runtime.js';
import { createSkillRuntime } from './runtime/skill-runtime.js';

async function bootstrap(): Promise<void> {
  const config = loadAgentConfig();
  const database = createAgentDatabase(config.sqlitePath);
  database.initialize();

  const skillRuntime = createSkillRuntime(config.skillManifestPath);
  const runtime = createAgentRuntime({
    execute: async ({ job, attempt }) => {
      const { skill, result } = await skillRuntime.executeByCommandType({
        commandType: job.commandType,
        payload: job.payload,
      });

      database.insertAuditLog({
        commandId: job.id,
        skill: skill.name,
        result: result.status,
        retryCount: attempt,
      });

      return { ok: result.status === 'succeeded', message: result.output };
    },
  });

  runtime.registerScheduledCommand({
    name: 'heartbeat-note',
    intervalMs: 60_000,
    commandType: 'note.healthcheck',
    payload: { appName: config.appName },
  });

  setInterval(() => {
    void runtime.processNext();
  }, 1_000);

  app.on('before-quit', () => {
    skillRuntime.close();
    runtime.shutdown();
  });
}

app.whenReady().then(async () => {
  await bootstrap();
});

app.on('window-all-closed', () => {
  // 常駐エージェント前提のため終了させない。
});
