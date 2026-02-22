import { CommandApiClient } from './api-client.js';
import { appConfig, buildCognitoLoginUrl } from './config.js';
import type { CommandStatus, CommandType } from './types.js';

const terminalStatuses: CommandStatus[] = ['succeeded', 'failed', 'cancelled'];

const appElement = document.querySelector<HTMLDivElement>('#app');
if (!appElement) {
  throw new Error('#app is required');
}

appElement.innerHTML = `
  <main>
    <h1>AI Secretary Control</h1>
    <section>
      <h2>Cognito Login</h2>
      <button id="loginButton" type="button">Login with Cognito</button>
      <p id="tokenStatus"></p>
    </section>

    <section>
      <h2>Command Submit</h2>
      <p>Role: operator-all (全コマンド許可)</p>
      <form id="commandForm">
        <label>Command Type
          <select id="commandType" required>
            <option value="join_meet">join_meet</option>
            <option value="share_screen_meet">share_screen_meet</option>
            <option value="note.capture">note.capture</option>
            <option value="note.export">note.export</option>
            <option value="devtask.submit">devtask.submit</option>
          </select>
        </label>
        <label>Payload(JSON)
          <textarea id="payloadInput" rows="6">{"title":"Weekly sync"}</textarea>
        </label>
        <fieldset id="devtaskFieldset">
          <legend>devtask.submit専用</legend>
          <label>Repository
            <input id="devtaskRepo" type="text" placeholder="owner/repo" />
          </label>
          <label>Task
            <textarea id="devtaskTask" rows="4" placeholder="実装タスクを入力"></textarea>
          </label>
        </fieldset>
        <button type="submit">Send Command</button>
      </form>
      <p id="submitResult"></p>
      <p id="statusResult"></p>
    </section>
  </main>
`;

const loginButton = document.querySelector<HTMLButtonElement>('#loginButton');
const commandForm = document.querySelector<HTMLFormElement>('#commandForm');
const commandTypeSelect = document.querySelector<HTMLSelectElement>('#commandType');
const payloadInput = document.querySelector<HTMLTextAreaElement>('#payloadInput');
const tokenStatus = document.querySelector<HTMLParagraphElement>('#tokenStatus');
const submitResult = document.querySelector<HTMLParagraphElement>('#submitResult');
const statusResult = document.querySelector<HTMLParagraphElement>('#statusResult');
const devtaskRepo = document.querySelector<HTMLInputElement>('#devtaskRepo');
const devtaskTask = document.querySelector<HTMLTextAreaElement>('#devtaskTask');

if (
  !loginButton ||
  !commandForm ||
  !commandTypeSelect ||
  !payloadInput ||
  !tokenStatus ||
  !submitResult ||
  !statusResult ||
  !devtaskRepo ||
  !devtaskTask
) {
  throw new Error('required elements are missing');
}

const accessToken = new URLSearchParams(window.location.hash.slice(1)).get('access_token') ?? '';
tokenStatus.textContent = accessToken ? 'Access token loaded.' : 'Access token not found.';

loginButton.addEventListener('click', () => {
  window.location.href = buildCognitoLoginUrl(appConfig);
});

commandTypeSelect.addEventListener('change', () => {
  const isDevtask = commandTypeSelect.value === 'devtask.submit';
  devtaskRepo.disabled = !isDevtask;
  devtaskTask.disabled = !isDevtask;
});

commandForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!accessToken) {
    submitResult.textContent = 'Login required: access token is missing.';
    return;
  }

  const commandType = commandTypeSelect.value as CommandType;
  const payload = parsePayload(commandType, payloadInput.value, devtaskRepo.value, devtaskTask.value);
  const client = new CommandApiClient(appConfig.apiBaseUrl, accessToken);

  try {
    const created = await client.submitCommand({ commandType, payload });
    submitResult.textContent = `Submitted: ${created.commandId} (${created.status})`;
    await pollStatus(client, created.commandId, statusResult);
  } catch (error) {
    submitResult.textContent = error instanceof Error ? error.message : 'Unknown submit error';
  }
});

const parsePayload = (
  commandType: CommandType,
  jsonText: string,
  repo: string,
  task: string
): Record<string, unknown> => {
  if (commandType === 'devtask.submit') {
    return {
      repository: repo,
      task
    };
  }

  return JSON.parse(jsonText) as Record<string, unknown>;
};

const pollStatus = async (
  client: CommandApiClient,
  commandId: string,
  target: HTMLParagraphElement
): Promise<void> => {
  for (let i = 0; i < 10; i += 1) {
    const response = await client.getCommandState(commandId);
    target.textContent = `Status: ${response.command.status}`;
    if (terminalStatuses.includes(response.command.status)) {
      return;
    }

    await sleep(1000);
  }
};

const sleep = async (ms: number): Promise<void> =>
  new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
