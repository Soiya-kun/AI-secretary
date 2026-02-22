import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CalendarClient, CalendarEvent } from './meeting-module.js';

interface CalendarSource {
  events: CalendarEvent[];
}

interface GoogleCalendarListResponse {
  items?: Array<{
    id?: string;
    summary?: string;
    description?: string;
    location?: string;
    hangoutLink?: string;
    start?: {
      dateTime?: string;
    };
    end?: {
      dateTime?: string;
    };
  }>;
}

function parseEventsFromFile(eventsFilePath: string, fromMs: number, toMs: number): CalendarEvent[] {
  const absolutePath = resolve(eventsFilePath);
  const raw = readFileSync(absolutePath, 'utf-8');
  const parsed = JSON.parse(raw) as Partial<CalendarSource>;
  const events = parsed.events ?? [];

  return events
    .filter((event): event is CalendarEvent => {
      return (
        typeof event.id === 'string'
        && typeof event.title === 'string'
        && typeof event.startAtMs === 'number'
        && typeof event.endAtMs === 'number'
      );
    })
    .filter((event) => event.startAtMs <= toMs && event.endAtMs >= fromMs)
    .sort((a, b) => a.startAtMs - b.startAtMs);
}

function parseTimestampMs(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeApiEvents(response: GoogleCalendarListResponse): CalendarEvent[] {
  return (response.items ?? [])
    .map((item): CalendarEvent | undefined => {
      const startAtMs = parseTimestampMs(item.start?.dateTime);
      const endAtMs = parseTimestampMs(item.end?.dateTime);
      if (!item.id || !item.summary || startAtMs === undefined || endAtMs === undefined) {
        return undefined;
      }

      return {
        id: item.id,
        title: item.summary,
        startAtMs,
        endAtMs,
        description: item.description,
        location: item.location,
        hangoutLink: item.hangoutLink,
      };
    })
    .filter((event): event is CalendarEvent => event !== undefined)
    .sort((a, b) => a.startAtMs - b.startAtMs);
}

async function fetchEventsFromGoogleCalendar(input: {
  calendarId: string;
  accessToken: string;
  fromMs: number;
  toMs: number;
}): Promise<CalendarEvent[]> {
  const query = new URLSearchParams({
    timeMin: new Date(input.fromMs).toISOString(),
    timeMax: new Date(input.toMs).toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
  });
  const encodedCalendarId = encodeURIComponent(input.calendarId);
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodedCalendarId}/events?${query.toString()}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Google Calendar API failed (${response.status}): ${body}`);
  }

  const payload = (await response.json()) as GoogleCalendarListResponse;
  return normalizeApiEvents(payload);
}

export function createGoogleCalendarClient(input: {
  eventsFilePath: string;
  calendarId: string;
  accessTokenEnvVar: string;
}): CalendarClient {
  return {
    listEvents: async ({ fromMs, toMs }) => {
      const accessToken = process.env[input.accessTokenEnvVar];
      if (accessToken && accessToken.trim().length > 0) {
        return fetchEventsFromGoogleCalendar({
          calendarId: input.calendarId,
          accessToken,
          fromMs,
          toMs,
        });
      }

      return parseEventsFromFile(input.eventsFilePath, fromMs, toMs);
    },
  };
}
