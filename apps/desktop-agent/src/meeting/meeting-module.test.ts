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
