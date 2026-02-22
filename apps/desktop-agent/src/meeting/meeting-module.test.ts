import assert from 'node:assert/strict';
import test from 'node:test';
import { createMeetingModule, type CalendarClient, type MeetingSkillExecutor } from './meeting-module.js';

test('joinScheduledMeeting extracts URL and executes join/share', async () => {
  const nowMs = Date.UTC(2026, 0, 1, 10, 0, 0);
  const calendarClient: CalendarClient = {
    listEvents: async () => [
      {
        id: 'event-1',
        startAtMs: nowMs + 60_000,
        endAtMs: nowMs + 3_600_000,
        title: 'daily sync',
        description: 'Join https://meet.google.com/abc-defg-hij',
      },
    ],
  };

  const calls: string[] = [];
  const skillExecutor: MeetingSkillExecutor = {
    execute: async ({ commandType }) => {
      calls.push(commandType);
      return {
        status: 'succeeded',
        output: `${commandType} done`,
      };
    },
  };

  const module = createMeetingModule({ calendarClient, skillExecutor });
  const result = await module.joinScheduledMeeting(nowMs);

  assert.equal(result.status, 'succeeded');
  assert.deepEqual(calls, ['meeting.join.now', 'meeting.share_screen.start']);
  assert.equal(result.meetUrl, 'https://meet.google.com/abc-defg-hij');
});

test('joinScheduledMeeting retries join skill up to success', async () => {
  const nowMs = Date.UTC(2026, 0, 1, 10, 0, 0);
  const calendarClient: CalendarClient = {
    listEvents: async () => [
      {
        id: 'event-2',
        startAtMs: nowMs,
        endAtMs: nowMs + 3_600_000,
        title: '1on1',
        hangoutLink: 'https://meet.google.com/aaa-bbbb-ccc',
      },
    ],
  };

  let joinCallCount = 0;
  const skillExecutor: MeetingSkillExecutor = {
    execute: async ({ commandType }) => {
      if (commandType === 'meeting.join.now') {
        joinCallCount += 1;
        if (joinCallCount < 3) {
          return { status: 'failed', output: 'temporary error' };
        }
      }

      return {
        status: 'succeeded',
        output: `${commandType} done`,
      };
    },
  };

  const module = createMeetingModule({ calendarClient, skillExecutor });
  const result = await module.joinScheduledMeeting(nowMs);

  assert.equal(result.joinAttemptCount, 3);
});

test('shareScreenNow retries and succeeds for direct share_screen execution', async () => {
  const calendarClient: CalendarClient = {
    listEvents: async () => [],
  };

  let shareCallCount = 0;
  const skillExecutor: MeetingSkillExecutor = {
    execute: async ({ commandType }) => {
      if (commandType === 'meeting.share_screen.start') {
        shareCallCount += 1;
        if (shareCallCount < 2) {
          return { status: 'failed', output: 'screen not ready' };
        }
      }

      return {
        status: 'succeeded',
        output: `${commandType} done`,
      };
    },
  };

  const module = createMeetingModule({ calendarClient, skillExecutor });
  const result = await module.shareScreenNow({
    eventId: 'event-3',
    title: 'standup',
    meetUrl: 'https://meet.google.com/abc-defg-hij',
  });

  assert.equal(result.attemptCount, 2);
  assert.equal(result.output, 'meeting.share_screen.start done');
});

test('listUpcomingEvents only returns entries in 5min-before to 1min-after join window', async () => {
  const nowMs = Date.UTC(2026, 0, 1, 10, 0, 0);
  const calendarClient: CalendarClient = {
    listEvents: async () => [
      {
        id: 'too-early',
        startAtMs: nowMs - 5 * 60 * 1000 - 1,
        endAtMs: nowMs + 3_600_000,
        title: 'too early',
      },
      {
        id: 'in-window',
        startAtMs: nowMs + 1,
        endAtMs: nowMs + 3_600_000,
        title: 'in window',
      },
      {
        id: 'too-late',
        startAtMs: nowMs + 5 * 60 * 1000 + 1,
        endAtMs: nowMs + 3_600_000,
        title: 'too late',
      },
    ],
  };

  const module = createMeetingModule({
    calendarClient,
    skillExecutor: {
      execute: async () => ({
        status: 'succeeded',
        output: 'ok',
      }),
    },
  });

  const events = await module.listUpcomingEvents(nowMs);
  assert.deepEqual(
    events.map((event) => event.id),
    ['in-window'],
  );
});

test('joinScheduledMeeting succeeds at both join-window boundaries', async () => {
  const eventStartMs = Date.UTC(2026, 0, 1, 10, 0, 0);
  const calendarClient: CalendarClient = {
    listEvents: async () => [
      {
        id: 'edge-window-event',
        startAtMs: eventStartMs,
        endAtMs: eventStartMs + 3_600_000,
        title: 'boundary test meeting',
        hangoutLink: 'https://meet.google.com/edge-case-ok',
      },
    ],
  };

  const calls: string[] = [];
  const skillExecutor: MeetingSkillExecutor = {
    execute: async ({ commandType }) => {
      calls.push(commandType);
      return {
        status: 'succeeded',
        output: `${commandType} done`,
      };
    },
  };

  const module = createMeetingModule({ calendarClient, skillExecutor });

  const atFiveMinutesBefore = await module.joinScheduledMeeting(eventStartMs - 5 * 60 * 1000);
  const atOneMinuteAfter = await module.joinScheduledMeeting(eventStartMs + 1 * 60 * 1000);

  assert.equal(atFiveMinutesBefore.status, 'succeeded');
  assert.equal(atOneMinuteAfter.status, 'succeeded');
  assert.deepEqual(calls, [
    'meeting.join.now',
    'meeting.share_screen.start',
    'meeting.join.now',
    'meeting.share_screen.start',
  ]);
});
