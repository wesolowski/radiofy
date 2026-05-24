export type Level = 'debug' | 'info' | 'warn' | 'error';

export type SourceTrackId = string;

export type SpotifyTrackId = string;

export interface Station {
  id: string;
  name: string;
  source: string;
  sourceSlug: string;
  playlistName: string;
  enabled: boolean;
}

export interface RawSong {
  sourceTrackId: SourceTrackId;
  displayText: string;
  artists: string[];
  title: string;
  playedAt: string;
}

export interface NormalizedSong {
  normalizedKey: string;
  primaryArtist: string;
  allArtists: string;
  title: string;
  originalArtists: string[];
  originalTitle: string;
}

export interface AppConfig {
  SPOTIFY_CLIENT_ID: string;
  SPOTIFY_CLIENT_SECRET: string;
  SPOTIFY_REDIRECT_URI: string;
  LOG_LEVEL: Level;
}
