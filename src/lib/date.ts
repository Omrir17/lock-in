export const TZ = 'Asia/Jerusalem';

/** YYYY-MM-DD for a moment, in Israel time. */
export function dayOf(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

export function today(): string {
  return dayOf(new Date());
}

/** Date at noon UTC for a YYYY-MM-DD, safe for day arithmetic. */
export function parseDay(s: string): Date {
  return new Date(s + 'T12:00:00Z');
}

export function addDays(s: string, n: number): string {
  const d = parseDay(s);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function diffDays(a: string, b: string): number {
  return Math.round((parseDay(a).getTime() - parseDay(b).getTime()) / 86400000);
}

/** Sunday that starts the week containing s. */
export function weekStart(s: string): string {
  return addDays(s, -parseDay(s).getUTCDay());
}

const DOW = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
export function dowShort(s: string): string {
  return DOW[parseDay(s).getUTCDay()];
}

export function shortDate(s: string): string {
  const d = parseDay(s);
  return `${d.getUTCDate()}.${d.getUTCMonth() + 1}`;
}

export function nowMinutes(): number {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
  const [h, m] = p.split(':').map(Number);
  return h * 60 + m;
}
