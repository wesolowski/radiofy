import { type Db, openDb, unmatchedRepo } from '@radiofy/database';
import { csvLine } from './csv.ts';

const HEADERS = [
  'normalized_key',
  'artist',
  'title',
  'source',
  'source_track_id',
  'station',
  'reason',
  'occurrence_count',
  'first_seen_at',
  'last_seen_at',
  'best_candidate_spotify_id',
  'best_candidate_score',
];

export interface ExportUnmatchedOptions {
  db?: Db;
  station?: string;
  since?: string;
  all?: boolean;
  stdout?: (line: string) => void;
}

export const runExportUnmatched = (options: ExportUnmatchedOptions): number => {
  const db = options.db ?? openDb();
  const stdout =
    options.stdout ??
    ((line: string): void => {
      process.stdout.write(`${line}\n`);
    });

  const rows = unmatchedRepo.list(db, {
    ...(options.station !== undefined ? { station: options.station } : {}),
    ...(options.since !== undefined ? { sinceIso: `${options.since}T00:00:00.000Z` } : {}),
    includeResolved: options.all === true,
  });

  stdout(csvLine(HEADERS));
  for (const row of rows) {
    stdout(
      csvLine([
        row.normalizedKey,
        row.artist,
        row.title,
        row.source,
        row.sourceTrackId,
        row.station,
        row.reason,
        row.occurrenceCount,
        row.firstSeenAt,
        row.lastSeenAt,
        row.bestCandidateSpotifyId,
        row.bestCandidateScore,
      ]),
    );
  }
  return rows.length;
};
