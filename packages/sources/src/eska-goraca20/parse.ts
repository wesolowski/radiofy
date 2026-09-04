import { logger } from '@radiofy/shared';
import * as cheerio from 'cheerio';

const ID_PATTERN = /-(so(?:-[A-Za-z0-9]{4}){3})\.html/;

export interface ChartParseInput {
  html: string;
}

export interface ChartEntry {
  sourceTrackId: string;
  rank: number;
  section: 'chart' | 'proposal';
  position: number | null;
  artists: string[];
  title: string;
  displayText: string;
}

interface ParsedHit {
  sourceTrackId: string;
  position: number | null;
  artists: string[];
  title: string;
}

const extractTrackId = (hrefs: string[]): string | null => {
  for (const href of hrefs) {
    const match = ID_PATTERN.exec(href);
    if (match?.[1] !== undefined) return match[1];
  }
  return null;
};

/**
 * Sections are told apart structurally rather than by heading text: the ranked
 * chart carries a numeric `.single-hit__position`, the proposals below it do
 * not. Both use identical markup, so a document-wide selector would silently
 * merge them.
 */
export const parseChart = ({ html }: ChartParseInput): ChartEntry[] => {
  const $ = cheerio.load(html);
  const hits: ParsedHit[] = [];

  $('div.single-hit').each((_, el) => {
    const $hit = $(el);

    const hrefs = $hit
      .find('a[href]')
      .map((_i, a) => $(a).attr('href') ?? '')
      .get();
    const sourceTrackId = extractTrackId(hrefs);
    if (sourceTrackId === null) {
      logger.debug('eska-goraca20.parse: skipping entry without a usable track id');
      return;
    }

    const title = $hit.find('a.single-hit__title').first().text().trim();
    if (title === '') {
      logger.debug('eska-goraca20.parse: skipping entry without a title', { sourceTrackId });
      return;
    }

    const artists = $hit
      .find('a.single-hit__author')
      .map((_i, a) => $(a).text().trim())
      .get()
      .filter((name) => name !== '');
    if (artists.length === 0) {
      logger.debug('eska-goraca20.parse: skipping entry without artists', { sourceTrackId });
      return;
    }

    const positionText = $hit.find('.single-hit__position').first().text().trim();
    const position = /^\d+$/.test(positionText) ? Number(positionText) : null;

    hits.push({ sourceTrackId, position, artists, title });
  });

  const chart = hits
    .filter((h): h is ParsedHit & { position: number } => h.position !== null)
    .sort((a, b) => a.position - b.position);
  const proposals = hits.filter((h) => h.position === null);

  return [...chart, ...proposals].map((hit, index) => ({
    sourceTrackId: hit.sourceTrackId,
    rank: index + 1,
    section: hit.position === null ? 'proposal' : 'chart',
    position: hit.position,
    artists: hit.artists,
    title: hit.title,
    displayText: `${hit.artists.join(', ')} - ${hit.title}`,
  }));
};
