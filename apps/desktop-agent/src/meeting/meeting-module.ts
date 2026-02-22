export interface CalendarEvent {
  id: string;
  startAtMs: number;
  endAtMs: number;
  title: string;
  hangoutLink?: string;
  description?: string;
  location?: string;
}

export interface CalendarClient {
  listEvents: (input: { fromMs: number; toMs: number }) => Promise<CalendarEvent[]>;
}

export interface MeetingSkillExecutor {
  execute: (input: {
    commandType: 'meeting.join.now' | 'meeting.share_screen.start';
    payload: Record<string, unknown>;
  }) => Promise<{ status: 'succeeded' | 'failed'; output: string }>;
}

export interface MeetingRunResult {
  status: 'succeeded' | 'failed';
  eventId: string;
  meetUrl: string;
  joinAttemptCount: number;
  shareAttemptCount: number;
  output: string;
}

export interface MeetingModule {
  listUpcomingEvents: (nowMs: number) => Promise<CalendarEvent[]>;
  extractMeetUrl: (event: CalendarEvent) => string | undefined;
  joinScheduledMeeting: (nowMs: number) => Promise<MeetingRunResult>;
}

const JOIN_WINDOW_BEFORE_MS = 5 * 60 * 1000;
const JOIN_WINDOW_AFTER_MS = 1 * 60 * 1000;
const MAX_SKILL_RETRY = 3;

function normalizeUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (/^https:\/\/meet\.google\.com\/[a-z0-9-]+$/i.test(trimmed)) {
    return trimmed;
  }

  throw new Error(`Invalid Google Meet URL: ${rawUrl}`);
}

function extractMeetUrlFromText(input: string): string | undefined {
  const matched = input.match(/https:\/\/meet\.google\.com\/[a-z0-9-]+/i);
  return matched ? normalizeUrl(matched[0]) : undefined;
}

function inJoinWindow(event: CalendarEvent, nowMs: number): boolean {
  return nowMs >= event.startAtMs - JOIN_WINDOW_BEFORE_MS && nowMs <= event.startAtMs + JOIN_WINDOW_AFTER_MS;
}

async function runSkillWithRetry(
  executor: MeetingSkillExecutor,
  commandType: 'meeting.join.now' | 'meeting.share_screen.start',
  payload: Record<string, unknown>,
): Promise<{ attemptCount: number; output: string }> {
  let lastOutput = '';

  for (let attempt = 1; attempt <= MAX_SKILL_RETRY; attempt += 1) {
    const result = await executor.execute({ commandType, payload });
    lastOutput = result.output;

    if (result.status === 'succeeded') {
      return {
        attemptCount: attempt,
        output: result.output,
      };
    }
  }

  throw new Error(`${commandType} failed after ${MAX_SKILL_RETRY} attempts: ${lastOutput}`);
}

export function createMeetingModule(input: {
  calendarClient: CalendarClient;
  skillExecutor: MeetingSkillExecutor;
}): MeetingModule {
  const listUpcomingEvents = async (nowMs: number): Promise<CalendarEvent[]> => {
    const events = await input.calendarClient.listEvents({
      fromMs: nowMs - JOIN_WINDOW_BEFORE_MS,
      toMs: nowMs + JOIN_WINDOW_AFTER_MS,
    });

    return events
      .filter((event) => inJoinWindow(event, nowMs))
      .sort((a, b) => a.startAtMs - b.startAtMs);
  };

  const extractMeetUrl = (event: CalendarEvent): string | undefined => {
    if (event.hangoutLink) {
      return normalizeUrl(event.hangoutLink);
    }

    return extractMeetUrlFromText(`${event.location ?? ''}\n${event.description ?? ''}`);
  };

  const joinScheduledMeeting = async (nowMs: number): Promise<MeetingRunResult> => {
    const upcoming = await listUpcomingEvents(nowMs);
    const targetEvent = upcoming[0];

    if (!targetEvent) {
      throw new Error('No event found in join window');
    }

    const meetUrl = extractMeetUrl(targetEvent);
    if (!meetUrl) {
      throw new Error(`Meet URL missing for event ${targetEvent.id}`);
    }

    const join = await runSkillWithRetry(input.skillExecutor, 'meeting.join.now', {
      meetUrl,
      eventId: targetEvent.id,
      title: targetEvent.title,
    });

    const share = await runSkillWithRetry(input.skillExecutor, 'meeting.share_screen.start', {
      meetUrl,
      eventId: targetEvent.id,
      title: targetEvent.title,
    });

    return {
      status: 'succeeded',
      eventId: targetEvent.id,
      meetUrl,
      joinAttemptCount: join.attemptCount,
      shareAttemptCount: share.attemptCount,
      output: `${join.output}\n${share.output}`,
    };
  };

  return {
    listUpcomingEvents,
    extractMeetUrl,
    joinScheduledMeeting,
  };
}
