import { type ParseInput, parse } from './parse.ts';
import { buildUrl } from './url.ts';

export const MALOPOLSKIE_MEDIA_ID = 'malopolskie-media' as const;

export const malopolskieMediaSource = {
  id: MALOPOLSKIE_MEDIA_ID,
  buildUrl,
  parse,
} as const;

export { buildUrl, parse };
export type { ParseInput };
