import { asciiFold } from '@radiofy/normalizer';
import type { NormalizedSong } from '@radiofy/shared';
import { spotifyFetch } from './http.ts';
import { type ScoredCandidate, type SpotifyTrackPayload, scoreCandidates } from './score.ts';

const SEARCH_URL = 'https://api.spotify.com/v1/search';
const LIMIT = 10;

interface SearchResponse {
  tracks?: {
    items?: SpotifyTrackPayload[];
  };
}

const queryFor = (artist: string, title: string): string => {
  const params = new URLSearchParams({
    q: `artist:${artist} track:${title}`,
    type: 'track',
    limit: String(LIMIT),
  });
  return `${SEARCH_URL}?${params.toString()}`;
};

const fetchItems = async (
  artist: string,
  title: string,
  accessToken: string,
): Promise<SpotifyTrackPayload[]> => {
  const res = await spotifyFetch(queryFor(artist, title), accessToken);
  if (!res.ok) return [];
  const body = (await res.json()) as SearchResponse;
  return body.tracks?.items ?? [];
};

export interface SearchOptions {
  durationMs?: number;
}

export const searchTrack = async (
  song: NormalizedSong,
  accessToken: string,
  options: SearchOptions = {},
): Promise<ScoredCandidate[]> => {
  const foldedArtist = asciiFold(song.primaryArtist);
  const foldedTitle = asciiFold(song.title);

  let items = await fetchItems(foldedArtist, foldedTitle, accessToken);

  const hasDiacritics = foldedArtist !== song.primaryArtist || foldedTitle !== song.title;
  if (items.length === 0 && hasDiacritics) {
    items = await fetchItems(song.primaryArtist, song.title, accessToken);
  }

  if (items.length === 0) return [];

  return scoreCandidates(
    options.durationMs === undefined ? { song } : { song, durationMs: options.durationMs },
    items,
  );
};
