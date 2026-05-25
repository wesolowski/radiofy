import { asciiFold } from '@radiofy/normalizer';
import type { NormalizedSong } from '@radiofy/shared';
import { jaroWinkler } from './jaro-winkler.ts';

const TITLE_WEIGHT = 0.5;
const ARTIST_WEIGHT = 0.4;
const DURATION_WEIGHT = 0.1;
const TITLE_MIN_SIMILARITY = 0.5;
const DURATION_TOLERANCE_MS = 5000;

export interface SpotifyArtistRef {
  id: string;
  name: string;
}

export interface SpotifyTrackPayload {
  id: string;
  name: string;
  artists: SpotifyArtistRef[];
  duration_ms: number;
}

export interface ScoredCandidate {
  spotifyTrackId: string;
  trackName: string;
  artists: string[];
  durationMs: number;
  score: number;
  titleSimilarity: number;
  artistOverlap: number;
}

const fold = (s: string): string => asciiFold(s.toLowerCase());

const durationProximity = (input?: number, candidate?: number): number | null => {
  if (input === undefined || candidate === undefined) return null;
  const diff = Math.abs(input - candidate);
  return 1 - Math.min(1, diff / DURATION_TOLERANCE_MS);
};

export interface ScoreInput {
  song: NormalizedSong;
  durationMs?: number;
}

export const scoreCandidates = (
  input: ScoreInput,
  items: SpotifyTrackPayload[],
): ScoredCandidate[] => {
  const foldedTitle = fold(input.song.title);
  const foldedArtist = fold(input.song.primaryArtist);

  return items
    .map((track) => {
      const titleSimilarity = jaroWinkler(foldedTitle, fold(track.name));
      const artistOverlap =
        track.artists.length === 0
          ? 0
          : Math.max(...track.artists.map((a) => jaroWinkler(foldedArtist, fold(a.name))));
      const duration = durationProximity(input.durationMs, track.duration_ms);

      const score =
        duration === null
          ? (TITLE_WEIGHT * titleSimilarity + ARTIST_WEIGHT * artistOverlap) /
            (TITLE_WEIGHT + ARTIST_WEIGHT)
          : TITLE_WEIGHT * titleSimilarity +
            ARTIST_WEIGHT * artistOverlap +
            DURATION_WEIGHT * duration;

      return {
        spotifyTrackId: track.id,
        trackName: track.name,
        artists: track.artists.map((a) => a.name),
        durationMs: track.duration_ms,
        score,
        titleSimilarity,
        artistOverlap,
      };
    })
    .filter((c) => c.titleSimilarity >= TITLE_MIN_SIMILARITY)
    .sort((a, b) => b.score - a.score);
};
