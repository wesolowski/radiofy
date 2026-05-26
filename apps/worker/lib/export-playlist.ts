import {
  PlaylistNotFoundError,
  getAccessToken,
  getPlaylistByName,
  getPlaylistTracks,
} from '@radiofy/spotify';
import { csvLine } from './csv.ts';

const HEADERS = ['spotify_track_id', 'primary_artist', 'all_artists', 'title', 'added_at'];

export interface ExportPlaylistOptions {
  name: string;
  accessToken?: string;
  stdout?: (line: string) => void;
}

export type ExportPlaylistOutcome =
  | { kind: 'ok'; rows: number }
  | { kind: 'not_found'; name: string };

export const runExportPlaylist = async (
  options: ExportPlaylistOptions,
): Promise<ExportPlaylistOutcome> => {
  const stdout =
    options.stdout ??
    ((line: string): void => {
      process.stdout.write(`${line}\n`);
    });
  const token = options.accessToken ?? (await getAccessToken());

  let playlistId: string;
  try {
    const found = await getPlaylistByName(options.name, token);
    playlistId = found.id;
  } catch (err) {
    if (err instanceof PlaylistNotFoundError) {
      return { kind: 'not_found', name: options.name };
    }
    throw err;
  }

  const tracks = await getPlaylistTracks(playlistId, token);
  stdout(csvLine(HEADERS));
  for (const t of tracks) {
    stdout(csvLine([t.spotifyTrackId, t.primaryArtist, t.allArtists, t.title, t.addedAt]));
  }
  return { kind: 'ok', rows: tracks.length };
};
