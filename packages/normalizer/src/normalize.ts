import type { NormalizedSong, RawSong } from '@radiofy/shared';
import { asciiFold } from './ascii-fold.ts';

const NOISE_TERMS = new Set(['original mix', 'radio edit', 'bonus track', 'remix']);

const FEATURING_PATTERN = /\s*(?:\bfeat\.?|\bft\.?|\bfeaturing\b).*$/gi;
const AMP_PATTERN = /&amp;|&/g;
const PAREN_PATTERN = /[([]\s*([^)\]]+?)\s*[)\]]/g;
const WHITESPACE_PATTERN = /\s+/g;

const stripParentheticalNoise = (s: string): string =>
  s.replace(PAREN_PATTERN, (full, inner: string) => {
    const term = inner.toLowerCase().trim();
    return NOISE_TERMS.has(term) ? '' : full;
  });

const normalizeSegment = (input: string): string => {
  let out = input.toLowerCase();
  out = out.replace(AMP_PATTERN, ' and ');
  out = out.replace(FEATURING_PATTERN, '');
  out = stripParentheticalNoise(out);
  out = asciiFold(out);
  out = out.replace(WHITESPACE_PATTERN, ' ').trim();
  return out;
};

export const normalize = (raw: RawSong): NormalizedSong => {
  const primaryArtist = raw.artists[0] ?? '';
  const allArtists = raw.artists.join('|');
  const normalizedKey = `${normalizeSegment(primaryArtist)}|${normalizeSegment(raw.title)}`;

  return {
    normalizedKey,
    primaryArtist,
    allArtists,
    title: raw.title,
    originalArtists: raw.artists,
    originalTitle: raw.title,
  };
};

export const normalizeKeyOnly = (artist: string, title: string): string =>
  `${normalizeSegment(artist)}|${normalizeSegment(title)}`;
