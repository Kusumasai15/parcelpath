/**
 * India Standard Time (IST, UTC+05:30) date utilities.
 * Ensures consistent date keys, calendar day matching, and midnight rollover.
 */

export interface IstDateParts {
  year: number;
  month: number; // 0-indexed (0 = Jan, 11 = Dec)
  day: number;
  dateStr: string; // YYYY-MM-DD
}

/**
 * Returns YYYY-MM-DD in India Standard Time.
 */
export function getIstDateStr(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * Returns year, 0-indexed month, day, and dateStr in IST.
 */
export function getIstDateParts(date: Date = new Date()): IstDateParts {
  const dateStr = getIstDateStr(date);
  const [year, month, day] = dateStr.split('-').map(Number);
  return { year, month: month - 1, day, dateStr };
}

/**
 * Calculates milliseconds until the next midnight in IST.
 */
export function msUntilNextIstMidnight(now: Date = new Date()): number {
  const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
  const nowIstMs = now.getTime() + IST_OFFSET_MS;
  const nowIstDate = new Date(nowIstMs);

  const nextDayIst = new Date(Date.UTC(
    nowIstDate.getUTCFullYear(),
    nowIstDate.getUTCMonth(),
    nowIstDate.getUTCDate() + 1,
    0, 0, 0, 0
  ));

  const msRemaining = nextDayIst.getTime() - nowIstMs;
  return Math.max(1000, msRemaining);
}

/**
 * Formats delivery window for parcels arriving today:
 * - If timeWindow is available, returns it in IST format
 * - If only a date is available, returns "Expected today · Time not provided"
 */
export function formatTodayDeliveryEta(timeWindow?: string, eta?: string): string {
  if (timeWindow && timeWindow.trim()) {
    return timeWindow.trim();
  }
  if (eta && (eta.includes(':') || eta.includes('AM') || eta.includes('PM'))) {
    return eta.trim();
  }
  return 'Expected today · Time not provided';
}
