export type CommandType =
  | 'join_meet'
  | 'share_screen_meet'
  | 'note.capture'
  | 'note.export'
  | 'devtask.submit';

export type CommandStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export type CommandRequest = {
  commandType: CommandType;
  payload: Record<string, unknown>;
};

export type CommandCreateResponse = {
  commandId: string;
  status: CommandStatus;
};

export type CommandStateResponse = {
  command: {
    command_id: string;
    command_type: CommandType;
    status: CommandStatus;
    payload: Record<string, unknown>;
    created_at: string;
    updated_at: string;
  };
};
