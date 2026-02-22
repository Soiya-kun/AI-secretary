import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createGoogleCalendarClient } from './google-calendar-client.js';

test('listEvents reads local file when access token is not set', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'calendar-test-'));
  const filePath = join(dir, 'events.json');
  writeFileSync(
    filePath,
    JSON.stringify({
      events: [
        {
          id: 'event-local-1',
          title: 'local event',
          startAtMs: Date.UTC(2026, 0, 1, 9, 0, 0),
          endAtMs: Date.UTC(2026, 0, 1, 10, 0, 0),
        },
      ],
    }),
  );

  const envKey = 'CALENDAR_TOKEN_FOR_TEST';
  delete process.env[envKey];

  const client = createGoogleCalendarClient({
    eventsFilePath: filePath,
    calendarId: 'primary',
    accessTokenEnvVar: envKey,
  });

  const events = await client.listEvents({
    fromMs: Date.UTC(2026, 0, 1, 8, 59, 0),
    toMs: Date.UTC(2026, 0, 1, 9, 1, 0),
  });

  assert.equal(events.length, 1);
  assert.equal(events[0]?.id, 'event-local-1');
});

test('listEvents uses Google Calendar API when access token exists', async () => {
  const envKey = 'CALENDAR_TOKEN_FOR_TEST';
  process.env[envKey] = 'token-value';

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    return new Response(
      JSON.stringify({
        items: [
          {
            id: 'event-api-1',
            summary: 'api event',
            start: { dateTime: '2026-01-01T09:00:00.000Z' },
            end: { dateTime: '2026-01-01T10:00:00.000Z' },
            hangoutLink: 'https://meet.google.com/abc-defg-hij',
          },
        ],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }) as typeof fetch;

  try {
    const client = createGoogleCalendarClient({
      eventsFilePath: './apps/desktop-agent/config/calendar-events.json',
      calendarId: 'primary',
      accessTokenEnvVar: envKey,
    });

    const events = await client.listEvents({
      fromMs: Date.UTC(2026, 0, 1, 8, 59, 0),
      toMs: Date.UTC(2026, 0, 1, 10, 1, 0),
    });

    assert.equal(events.length, 1);
    assert.equal(events[0]?.id, 'event-api-1');
    assert.equal(events[0]?.hangoutLink, 'https://meet.google.com/abc-defg-hij');
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env[envKey];
  }
});
