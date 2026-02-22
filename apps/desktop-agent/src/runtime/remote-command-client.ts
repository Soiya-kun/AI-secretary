export interface RemoteCommandRecord {
  command_id: string;
  command_type: string;
  payload: Record<string, unknown>;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
}

export interface RemoteCommandClientConfig {
  baseUrl: string;
  pollIntervalMs: number;
  authToken?: string;
}

export interface RemoteCommandClient {
  start: () => void;
  stop: () => void;
}

interface CommandListResponse {
  commands: RemoteCommandRecord[];
  auditId?: string;
}

export function createRemoteCommandClient(
  config: RemoteCommandClientConfig,
  hooks: {
    enqueueRemote: (commandType: string, payload: Record<string, unknown>) => string;
    onError?: (error: Error) => void;
  },
): RemoteCommandClient {
  const seenCommandIds = new Set<string>();
  let timer: ReturnType<typeof setInterval> | undefined;

  const pollOnce = async (): Promise<void> => {
    try {
      const headers: Record<string, string> = {};
      if (config.authToken) {
        headers.authorization = `Bearer ${config.authToken}`;
      }

      const response = await fetch(`${config.baseUrl}/v1/commands?status=queued`, {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        throw new Error(`Remote command polling failed with status ${response.status}`);
      }

      const body = (await response.json()) as Partial<CommandListResponse>;
      const commands = body.commands;
      if (!commands || !Array.isArray(commands)) {
        throw new Error('Remote command polling response is invalid');
      }

      for (const command of commands) {
        if (seenCommandIds.has(command.command_id)) {
          continue;
        }

        hooks.enqueueRemote(command.command_type, command.payload);
        seenCommandIds.add(command.command_id);
      }
    } catch (error) {
      if (hooks.onError) {
        hooks.onError(error instanceof Error ? error : new Error(String(error)));
      }
    }
  };

  return {
    start: () => {
      if (timer) {
        return;
      }

      void pollOnce();
      timer = setInterval(() => {
        void pollOnce();
      }, config.pollIntervalMs);
    },
    stop: () => {
      if (!timer) {
        return;
      }
      clearInterval(timer);
      timer = undefined;
    },
  };
}
