import { config } from '../config';

const TZ = config.timezone;

export function nowInMorocco(): Date {
  // Returns a Date whose local time matches Morocco time
  return new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
}

export function moroccoHour(): number {
  return nowInMorocco().getHours();
}

export function isClientNotifyWindow(): boolean {
  const h = moroccoHour();
  return h >= config.clientNotifyStartHour && h < config.clientNotifyEndHour;
}

export function nextClientNotifyTime(): Date {
  const now = nowInMorocco();
  const next = new Date(now);

  if (now.getHours() >= config.clientNotifyEndHour) {
    // After window — send next day at start hour
    next.setDate(next.getDate() + 1);
    next.setHours(config.clientNotifyStartHour, 0, 0, 0);
  } else if (now.getHours() < config.clientNotifyStartHour) {
    // Before window — send today at start hour
    next.setHours(config.clientNotifyStartHour, 0, 0, 0);
  }

  return next;
}

export function formatMoroccoDate(date: Date): string {
  return date.toLocaleString('fr-FR', {
    timeZone: TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Parse "HH:MM" string into { hour, minute } */
export function parseTimeString(t: string): { hour: number; minute: number } {
  const [h, m] = t.split(':').map(Number);
  return { hour: h ?? 0, minute: m ?? 0 };
}

/** Build an absolute Date for today at the given "HH:MM" in Morocco TZ */
export function todayAt(timeStr: string): Date {
  const { hour, minute } = parseTimeString(timeStr);
  const now = nowInMorocco();
  const d = new Date(now);
  d.setHours(hour, minute, 0, 0);
  return d;
}

/** Build an absolute Date for tomorrow at the given "HH:MM" in Morocco TZ */
export function tomorrowAt(timeStr: string): Date {
  const d = todayAt(timeStr);
  d.setDate(d.getDate() + 1);
  return d;
}

/** Start of today (00:00) in Morocco TZ */
export function startOfToday(): Date {
  const now = nowInMorocco();
  now.setHours(0, 0, 0, 0);
  return now;
}

/** Start of N days ago */
export function startOfDaysAgo(days: number): Date {
  const d = startOfToday();
  d.setDate(d.getDate() - days);
  return d;
}
