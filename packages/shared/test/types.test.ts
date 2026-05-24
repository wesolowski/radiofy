import { describe, expect, test } from 'bun:test';
import type {
  AppConfig,
  Level,
  NormalizedSong,
  RawSong,
  SourceTrackId,
  SpotifyTrackId,
  Station,
} from '../src/types.ts';

describe('domain types compile', () => {
  test('Station shape is constructible', () => {
    const s: Station = {
      id: 'radio-zet',
      name: 'ZET',
      source: 'malopolskie-media',
      sourceSlug: 'radio-zet',
      playlistName: 'Radio Zet Weekly Playlist',
      enabled: true,
    };
    expect(s.enabled).toBe(true);
  });

  test('RawSong shape is constructible', () => {
    const sid: SourceTrackId = '86665';
    const r: RawSong = {
      sourceTrackId: sid,
      displayText: 'Komodo - (I Just) Died In Your Arms',
      artists: ['Komodo'],
      title: '(I Just) Died In Your Arms',
      playedAt: '2026-05-23T22:08:00.000Z',
    };
    expect(r.artists).toHaveLength(1);
  });

  test('NormalizedSong shape is constructible', () => {
    const n: NormalizedSong = {
      normalizedKey: 'komodo|i just died in your arms',
      primaryArtist: 'Komodo',
      allArtists: 'Komodo',
      title: '(I Just) Died In Your Arms',
      originalArtists: ['Komodo'],
      originalTitle: '(I Just) Died In Your Arms',
    };
    expect(n.normalizedKey).toContain('|');
  });

  test('AppConfig and Level link correctly', () => {
    const lvl: Level = 'info';
    const cfg: AppConfig = {
      SPOTIFY_CLIENT_ID: 'cid',
      SPOTIFY_CLIENT_SECRET: 'sec',
      SPOTIFY_REDIRECT_URI: 'http://127.0.0.1:8888/callback',
      LOG_LEVEL: lvl,
    };
    const spotify: SpotifyTrackId = '0jXQrPLm0jKZTXdQRZzj1n';
    expect(cfg.LOG_LEVEL).toBe(lvl);
    expect(spotify.length).toBe(22);
  });
});
