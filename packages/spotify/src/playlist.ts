import { logger } from '@radiofy/shared';
import { SpotifyTransientError } from './errors.ts';
import { spotifyFetch } from './http.ts';

export const PLAYLIST_WRITE_BATCH = 100;
const ME_PLAYLISTS_PAGE_SIZE = 50;
const PLAYLIST_TRACKS_PAGE_SIZE = 100;

export class PlaylistNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlaylistNotFoundError';
  }
}

export class PlaylistEmptyError extends Error {
  constructor() {
    super('refuse to replace a playlist with an empty list of tracks');
    this.name = 'PlaylistEmptyError';
  }
}

interface RawPlaylistRef {
  id: string;
  name: string;
}

interface MePlaylistsPage {
  items: RawPlaylistRef[];
  next: string | null;
}

interface RawPlaylistArtist {
  id: string;
  name: string;
}

interface RawPlaylistTrack {
  added_at?: string;
  track: {
    type?: string;
    is_local?: boolean;
    id: string | null;
    name: string;
    artists: RawPlaylistArtist[];
  } | null;
}

interface PlaylistTracksPage {
  items: RawPlaylistTrack[];
  next: string | null;
}

export interface PlaylistTrack {
  spotifyTrackId: string;
  primaryArtist: string;
  allArtists: string;
  title: string;
  addedAt: string | null;
}

export interface ReplaceResult {
  snapshotId: string;
}

const ME_PLAYLISTS_URL = `https://api.spotify.com/v1/me/playlists?limit=${ME_PLAYLISTS_PAGE_SIZE}`;

export const getPlaylistByName = async (
  name: string,
  accessToken: string,
): Promise<{ id: string }> => {
  let url: string | null = ME_PLAYLISTS_URL;
  const matches: RawPlaylistRef[] = [];

  while (url !== null) {
    const res = await spotifyFetch(url, accessToken);
    if (!res.ok) {
      throw new SpotifyTransientError(`Spotify ${res.status} on /me/playlists`, res.status);
    }
    const body = (await res.json()) as MePlaylistsPage;
    for (const item of body.items) {
      if (item.name === name) matches.push(item);
    }
    if (matches.length > 0) break;
    url = body.next;
  }

  if (matches.length === 0) {
    throw new PlaylistNotFoundError(`no playlist named "${name}" in the user's library`);
  }
  if (matches.length > 1) {
    logger.warn(`spotify: multiple playlists named '${name}', using first`, {
      count: matches.length,
    });
  }
  const first = matches[0];
  if (first === undefined) {
    throw new PlaylistNotFoundError(`no playlist named "${name}" in the user's library`);
  }
  return { id: first.id };
};

export const getPlaylistTracks = async (
  playlistId: string,
  accessToken: string,
): Promise<PlaylistTrack[]> => {
  const tracks: PlaylistTrack[] = [];
  let url: string | null =
    `https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}/tracks?limit=${PLAYLIST_TRACKS_PAGE_SIZE}`;

  while (url !== null) {
    const res = await spotifyFetch(url, accessToken);
    if (res.status === 404) {
      throw new PlaylistNotFoundError(`no playlist with id "${playlistId}"`);
    }
    if (!res.ok) {
      throw new SpotifyTransientError(
        `Spotify ${res.status} on /playlists/{id}/tracks`,
        res.status,
      );
    }
    const body = (await res.json()) as PlaylistTracksPage;
    for (const item of body.items) {
      if (item.track === null || item.track.id === null || item.track.is_local === true) {
        logger.debug('spotify: skipping non-track playlist item', { playlistId });
        continue;
      }
      const artists = item.track.artists;
      const primary = artists[0]?.name ?? '';
      tracks.push({
        spotifyTrackId: item.track.id,
        primaryArtist: primary,
        allArtists: artists.map((a) => a.name).join('|'),
        title: item.track.name,
        addedAt: item.added_at ?? null,
      });
    }
    url = body.next;
  }

  return tracks;
};

/**
 * Replaces the playlist with the given track list using a clear-then-append
 * flow: one PUT with an empty URI list wipes the existing contents, then one
 * or more POSTs append the new URIs in chunks of `PLAYLIST_WRITE_BATCH`.
 * Spotify accepts at most 100 URIs per call on both endpoints.
 */
export const replacePlaylistTracks = async (
  playlistId: string,
  spotifyTrackIds: readonly string[],
  accessToken: string,
): Promise<ReplaceResult> => {
  if (spotifyTrackIds.length === 0) {
    throw new PlaylistEmptyError();
  }

  const uris = spotifyTrackIds.map((id) =>
    id.startsWith('spotify:track:') ? id : `spotify:track:${id}`,
  );
  const url = `https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}/tracks`;

  const clear = await spotifyFetch(url, accessToken, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uris: [] }),
  });
  if (clear.status === 404) {
    throw new PlaylistNotFoundError(`no playlist with id "${playlistId}"`);
  }
  if (!clear.ok) {
    throw new SpotifyTransientError(
      `Spotify ${clear.status} on PUT /playlists/{id}/tracks`,
      clear.status,
    );
  }
  let snapshotId = ((await clear.json()) as { snapshot_id: string }).snapshot_id;

  for (let offset = 0; offset < uris.length; offset += PLAYLIST_WRITE_BATCH) {
    const batch = uris.slice(offset, offset + PLAYLIST_WRITE_BATCH);
    const res = await spotifyFetch(url, accessToken, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uris: batch }),
    });
    if (res.status === 404) {
      throw new PlaylistNotFoundError(`no playlist with id "${playlistId}"`);
    }
    if (!res.ok) {
      throw new SpotifyTransientError(
        `Spotify ${res.status} on POST /playlists/{id}/tracks`,
        res.status,
      );
    }
    snapshotId = ((await res.json()) as { snapshot_id: string }).snapshot_id;
  }

  return { snapshotId };
};
