import { toZoned } from '@radiofy/shared';

const DAY_MS = 24 * 60 * 60 * 1000;

export const yesterdayInTz = (now: Date = new Date(), tz = 'Europe/Warsaw'): string => {
  const oneDayEarlier = new Date(now.getTime() - DAY_MS);
  const zoned = toZoned(oneDayEarlier, tz);
  const y = zoned.getFullYear();
  const m = String(zoned.getMonth() + 1).padStart(2, '0');
  const d = String(zoned.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};
