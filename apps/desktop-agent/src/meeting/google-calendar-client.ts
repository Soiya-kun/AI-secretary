import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CalendarClient, CalendarEvent } from './meeting-module.js';

interface CalendarSource {
  events: CalendarEvent[];
}

export function createGoogleCalendarClient(eventsFilePath: string): CalendarClient {
  const absolutePath = resolve(eventsFilePath);

  return {
    listEvents: async ({ fromMs, toMs }) => {
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
    },
  };
}
