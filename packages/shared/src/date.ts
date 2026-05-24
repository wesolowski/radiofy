import { fromZonedTime, toZonedTime } from 'date-fns-tz';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export interface UtcWindow {
  from: Date;
  to: Date;
}

export const toUtc = (wallClock: string | Date, sourceTz: string): Date =>
  fromZonedTime(wallClock, sourceTz);

export const toZoned = (utc: Date | string | number, targetTz: string): Date =>
  toZonedTime(utc, targetTz);

export const utcIsoNow = (): string => new Date().toISOString();

export const rollingWeekWindow = (now: Date = new Date()): UtcWindow => ({
  from: new Date(now.getTime() - SEVEN_DAYS_MS),
  to: now,
});
