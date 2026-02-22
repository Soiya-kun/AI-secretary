import type { CommandCreateResponse, CommandRequest, CommandStateResponse } from './types.js';

export class CommandApiClient {
  constructor(private readonly apiBaseUrl: string, private readonly accessToken: string) {}

  private async request(path: string, init: RequestInit): Promise<Response> {
    const response = await fetch(`${this.apiBaseUrl}${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.accessToken}`,
        ...(init.headers ?? {})
      }
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { message?: string };
      throw new Error(body.message ?? `request failed: ${response.status}`);
    }

    return response;
  }

  async submitCommand(request: CommandRequest): Promise<CommandCreateResponse> {
    const response = await this.request('/v1/commands', {
      method: 'POST',
      body: JSON.stringify(request)
    });

    return (await response.json()) as CommandCreateResponse;
  }

  async getCommandState(commandId: string): Promise<CommandStateResponse> {
    const response = await this.request(`/v1/commands/${commandId}`, { method: 'GET' });
    return (await response.json()) as CommandStateResponse;
  }
}
