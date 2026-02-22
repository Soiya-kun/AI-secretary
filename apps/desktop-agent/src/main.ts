import { app, Menu, Tray } from 'electron';
import { loadAgentConfig } from './config.js';
import { createAgentDatabase } from './db.js';
import { createAgentRuntime } from './runtime/agent-runtime.js';
import { createNotesModule } from './notes/notes-module.js';
import { createSkillRuntime } from './runtime/skill-runtime.js';
import { createGoogleCalendarClient } from './meeting/google-calendar-client.js';
import { createMeetingModule } from './meeting/meeting-module.js';

type GitSyncMode = 'direct' | 'pr' | 'hold';

function resolveGitSyncMode(payload: Record<string, unknown>): GitSyncMode {
  const mode = payload.gitSyncMode;
  if (mode === 'direct' || mode === 'pr' || mode === 'hold') {
    return mode;
  }

  return 'direct';
}

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
  const notesModule = createNotesModule(config.notesRootPath);

  const meetingModule = createMeetingModule({
    calendarClient: createGoogleCalendarClient({
      eventsFilePath: config.calendarEventsPath,
      calendarId: config.googleCalendar.calendarId,
      accessTokenEnvVar: config.googleCalendar.accessTokenEnvVar,
    }),
    skillExecutor: {
      execute: async ({ commandType, payload }) => {
        const { result } = await skillRuntime.executeByCommandType({ commandType, payload });
        return {
          status: result.status,
          output: result.output,
        };
      },
    },
  });
  const runtime = createAgentRuntime({
    execute: async ({ job, attempt }) => {
      let auditLogWritten = false;
      const writeAuditLog = (input: { skill: string; result: 'succeeded' | 'failed'; retryCount: number }): void => {
        database.ensureAuditLogWritten({
          commandId: job.id,
          skill: input.skill,
          result: input.result,
          retryCount: input.retryCount,
        });
        auditLogWritten = true;
      };

      if (job.commandType === 'devtask.submit') {
        const repo = typeof job.payload.repo === 'string' ? job.payload.repo : undefined;
        if (repo) {
          notesModule.ensureDevtaskDirectory(repo);
        }
      }


      if (job.commandType === 'meeting.autojoin') {
        try {
          const meetingResult = await meetingModule.joinScheduledMeeting(Date.now());

          writeAuditLog({
            skill: 'join_meet',
            result: 'succeeded',
            retryCount: meetingResult.joinAttemptCount,
          });

          writeAuditLog({
            skill: 'share_screen_meet',
            result: 'succeeded',
            retryCount: meetingResult.shareAttemptCount,
          });

          return { ok: true, message: meetingResult.output };
        } catch (error) {
          writeAuditLog({
            skill: 'meeting.autojoin',
            result: 'failed',
            retryCount: attempt,
          });

          return {
            ok: false,
            message: error instanceof Error ? error.message : String(error),
          };
        }
      }

      if (job.commandType === 'note.capture') {
        const content = typeof job.payload.content === 'string' ? job.payload.content : '';
        const markdown = notesModule.generateMarkdown({
          sections: [
            {
              title: '追加メモ',
              lines: [content || '入力なし'],
            },
          ],
        });

        let repo = notesModule.extractRepoFromText(content);

        if (!repo) {
          const repoDetection = await skillRuntime.executeByCommandType({
            commandType: 'note.repo.detect',
            payload: {
              content,
            },
          });

          if (repoDetection.result.status === 'succeeded') {
            repo = notesModule.extractRepoFromSkillOutput(repoDetection.result.output);
          }
        }

        if (!repo) {
          notesModule.saveUnknownRepoNote({
            markdown,
            fileName: `note-${job.id}`,
          });
        } else {
          const gitSyncMode = resolveGitSyncMode(job.payload);
          try {
            const exportResult = notesModule.syncNoteToGit({
              repo,
              markdown,
              fileName: `note-${job.id}`,
              mode: gitSyncMode,
            });

            database.insertGitExport({
              commandId: job.id,
              repo: exportResult.repo,
              branch: exportResult.branch,
              commitHash: exportResult.commitHash,
              exportStatus: exportResult.status,
            });
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const body = [
              `command_id: ${job.id}`,
              `repo: ${repo}`,
              `reason: ${errorMessage}`,
            ].join('\n');

            try {
              notesModule.sendGitSyncFailureEmail({
                to: config.gitSyncFailureEmailTo,
                subject: `[AI Secretary] Git同期失敗 (${job.id})`,
                body,
              });
            } catch {
              // メール送信失敗時も処理を継続し、失敗状態だけは確実に保存する。
            }

            database.insertGitExport({
              commandId: job.id,
              repo,
              branch: 'unknown',
              exportStatus: 'failed',
            });
          }
        }
      }

      const { skill, result } = await skillRuntime.executeByCommandType({
        commandType: job.commandType,
        payload: job.payload,
      });

      writeAuditLog({
        skill: skill.name,
        result: result.status,
        retryCount: attempt,
      });

      if (!auditLogWritten) {
        throw new Error(`Audit log must be written for command ${job.id}`);
      }

      return { ok: result.status === 'succeeded', message: result.output };
    },
  });

  runtime.registerScheduledCommand({
    name: 'heartbeat-note',
    intervalMs: 60_000,
    commandType: 'note.healthcheck',
    payload: { appName: config.appName },
  });


  runtime.registerScheduledCommand({
    name: 'meeting-autojoin',
    intervalMs: 60_000,
    commandType: 'meeting.autojoin',
    payload: { source: 'google_calendar' },
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
