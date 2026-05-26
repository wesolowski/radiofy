import { type ParseInput, parse } from './parse.ts';
import { buildUrl } from './url.ts';

export const MALOPOLSKIE_MEDIA_ID = 'malopolskie-media' as const;

const dayUrls = (stationSlug: string, day: string): string[] => [buildUrl(stationSlug, day)];

export const malopolskieMediaSource = {
  id: MALOPOLSKIE_MEDIA_ID,
  buildUrl,
  dayUrls,
  parse,
} as const;

export { buildUrl, dayUrls, parse };
export type { ParseInput };
