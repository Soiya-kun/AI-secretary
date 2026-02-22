import { app } from 'electron';
import { loadAgentConfig } from './config.js';
import { createAgentDatabase } from './db.js';
import { createAgentRuntime } from './runtime/agent-runtime.js';

async function bootstrap(): Promise<void> {
  const config = loadAgentConfig();
  const database = createAgentDatabase(config.sqlitePath);
  database.initialize();

  const runtime = createAgentRuntime({
    execute: async () => ({ ok: true }),
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
}

app.whenReady().then(async () => {
  await bootstrap();
});

app.on('window-all-closed', () => {
  // 常駐エージェント前提のため終了させない。
});
