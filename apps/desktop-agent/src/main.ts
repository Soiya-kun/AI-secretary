import { app, Menu, Tray } from 'electron';
import { loadAgentConfig } from './config.js';
import { createAgentDatabase } from './db.js';
import { createAgentRuntime } from './runtime/agent-runtime.js';
import { createSkillRuntime } from './runtime/skill-runtime.js';

function createTray(appName: string): Tray {
  const tray = new Tray(process.execPath);
  tray.setToolTip(appName);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: 'Quit',
        click: () => {
          app.quit();
        },
      },
    ]),
  );

  return tray;
}

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

  const tray = config.startInTray ? createTray(config.appName) : undefined;

  setInterval(() => {
    void runtime.processNext();
  }, 1_000);

  app.on('before-quit', () => {
    tray?.destroy();
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
