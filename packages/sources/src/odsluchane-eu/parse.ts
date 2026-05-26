import { type RawSong, logger, toUtc } from '@radiofy/shared';
import * as cheerio from 'cheerio';

const URL_PREFIX = '/utwor/';
const TIME_PATTERN = /^\d{1,2}:\d{2}$/;
const ID_PATTERN = /\/utwor\/(\d+)/;

export interface ParseInput {
  html: string;
  station: string;
  day: string;
  tz?: string;
}

export const parse = ({ html, station, day, tz = 'Europe/Warsaw' }: ParseInput): RawSong[] => {
  const $ = cheerio.load(html);
  const songs: RawSong[] = [];

  $('table tr').each((_, row) => {
    const $row = $(row);
    const $link = $row.find(`a[href*="${URL_PREFIX}"]`).first();
    if ($link.length === 0) return;

    const href = $link.attr('href');
    if (!href) return;

    const idMatch = ID_PATTERN.exec(href);
    const sourceTrackId = idMatch?.[1] ?? null;
    if (sourceTrackId === null) {
      logger.debug('odsluchane-eu.parse: skipping link without numeric id', { station, href });
      return;
    }

    const displayText = $link.text().replace(/\s+/g, ' ').trim();

    const split = splitArtistTitle(displayText);
    if (split === null) {
      logger.debug('odsluchane-eu.parse: skipping malformed display text', {
        station,
        displayText,
      });
      return;
    }

    const timeText = $row.find('td').first().text().trim();
    if (!TIME_PATTERN.test(timeText)) {
      logger.debug('odsluchane-eu.parse: skipping row with bad time cell', { station, timeText });
      return;
    }

    songs.push({
      sourceTrackId,
      displayText,
      artists: split.artists,
      title: split.title,
      playedAt: computePlayedAt(day, timeText, tz),
    });
  });

  return songs;
};

const splitArtistTitle = (text: string): { artists: string[]; title: string } | null => {
  const idx = text.indexOf(' - ');
  if (idx === -1) return null;
  const artistsRaw = text.slice(0, idx).trim();
  const title = text.slice(idx + 3).trim();
  if (artistsRaw === '' || title === '') return null;
  const artists = artistsRaw
    .split(' / ')
    .map((a) => a.trim())
    .filter((a) => a.length > 0);
  if (artists.length === 0) return null;
  return { artists, title };
};

const computePlayedAt = (day: string, time: string, tz: string): string =>
  toUtc(`${day}T${time}:00`, tz).toISOString();
