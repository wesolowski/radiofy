import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { type Db, openDb, syncRunsRepo, unmatchedRepo } from '@radiofy/database';
import { type Chart, type Station, loadCharts, loadStations, logger } from '@radiofy/shared';
import { runTopPlayed } from './top-played.ts';

const DEFAULT_OUT_PATH = 'storage/report.html';
const TOP_SONGS = 20;
const TOP_UNMATCHED = 10;
const CHART_RUNS = 8;
const DISPLAY_TZ = 'Europe/Warsaw';

export interface ReportOptions {
  db?: Db;
  stationsPath?: string;
  chartsPath?: string;
  outPath?: string;
  now?: () => Date;
}

export interface TopSong {
  rank: number;
  title: string;
  primaryArtist: string;
  plays: number;
}

export interface StationBlock {
  id: string;
  name: string;
  playlistName: string;
  lastUpdatedAt: string | null;
  tracksWritten: number | null;
  songs: TopSong[];
}

export interface ChartRun {
  finishedAt: string | null;
  entriesSeen: number | null;
  tracksWritten: number | null;
  error: string | null;
}

export interface ChartBlock {
  id: string;
  name: string;
  playlistName: string;
  lastUpdatedAt: string | null;
  tracksWritten: number | null;
  runs: ChartRun[];
}

export interface UnmatchedRow {
  artist: string;
  title: string;
  station: string;
  occurrences: number;
  lastSeenAt: string;
}

export interface ReportModel {
  generatedAt: string;
  windowFrom: string;
  stations: StationBlock[];
  charts: ChartBlock[];
  unmatched: UnmatchedRow[];
}

const stationBlock = (db: Db, station: Station, songs: TopSong[]): StationBlock => {
  const lastSync = syncRunsRepo.lastSuccess(db, station.id);
  return {
    id: station.id,
    name: station.name,
    playlistName: station.playlistName,
    lastUpdatedAt: lastSync?.finishedAt ?? null,
    tracksWritten: lastSync?.tracksWritten ?? null,
    songs,
  };
};

const chartBlock = (db: Db, chart: Chart): ChartBlock => {
  const runs = syncRunsRepo.recent(db, chart.id, CHART_RUNS);
  const lastSuccess = syncRunsRepo.lastSuccess(db, chart.id);
  return {
    id: chart.id,
    name: chart.name,
    playlistName: chart.playlistName,
    lastUpdatedAt: lastSuccess?.finishedAt ?? null,
    tracksWritten: lastSuccess?.tracksWritten ?? null,
    runs: runs.map((r) => ({
      finishedAt: r.finishedAt,
      entriesSeen: r.entriesSeen,
      tracksWritten: r.tracksWritten,
      error: r.error,
    })),
  };
};

/**
 * The database still holds rows under station ids retired in RDFY-028. Listing
 * them would put a station that no longer exists at the top of the table, so
 * only configured stations and charts are reported on.
 */
export const buildReport = (options: ReportOptions = {}): ReportModel => {
  const db = options.db ?? openDb();
  const now = options.now ?? ((): Date => new Date());
  const stations = loadStations(options.stationsPath).filter((s) => s.enabled);
  const charts = loadCharts(options.chartsPath).filter((c) => c.enabled);

  const topPlayedOptions: Parameters<typeof runTopPlayed>[0] = {
    db,
    limit: TOP_SONGS,
    now,
    stdout: (): void => undefined,
    color: false,
  };
  if (options.stationsPath !== undefined) topPlayedOptions.stationsPath = options.stationsPath;
  const top = runTopPlayed(topPlayedOptions);

  const songsFor = (stationId: string): TopSong[] =>
    (top.blocks.find((b) => b.station.id === stationId)?.rows ?? []).map((r) => ({
      rank: r.rank,
      title: r.title,
      primaryArtist: r.primaryArtist,
      plays: r.plays,
    }));

  const known = new Set<string>([...stations.map((s) => s.id), ...charts.map((c) => c.id)]);
  const unmatched = unmatchedRepo
    .list(db)
    .filter((u) => known.has(u.station))
    .slice(0, TOP_UNMATCHED)
    .map((u) => ({
      artist: u.artist,
      title: u.title,
      station: u.station,
      occurrences: u.occurrenceCount,
      lastSeenAt: u.lastSeenAt,
    }));

  return {
    generatedAt: now().toISOString(),
    windowFrom: new Date(now().getTime() - 7 * 24 * 3600 * 1000).toISOString(),
    stations: stations.map((s) => stationBlock(db, s, songsFor(s.id))),
    charts: charts.map((c) => chartBlock(db, c)),
    unmatched,
  };
};

export const runReport = (options: ReportOptions = {}): { path: string; model: ReportModel } => {
  const model = buildReport(options);
  const path = options.outPath ?? DEFAULT_OUT_PATH;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, renderReport(model), 'utf-8');
  logger.info('report: written', { path });
  return { path, model };
};

const escape = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const formatMoment = (iso: string | null): string => {
  if (iso === null) return 'never';
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-GB', {
    timeZone: DISPLAY_TZ,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const time = d.toLocaleTimeString('en-GB', {
    timeZone: DISPLAY_TZ,
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${date}, ${time}`;
};

const STALE_AFTER_HOURS = 36;

const isStale = (iso: string | null, now: Date): boolean =>
  iso === null || now.getTime() - new Date(iso).getTime() > STALE_AFTER_HOURS * 3_600_000;

const ageOf = (iso: string | null, now: Date): string => {
  if (iso === null) return 'not yet';
  const hours = Math.floor((now.getTime() - new Date(iso).getTime()) / 3_600_000);
  if (hours < 1) return 'under an hour ago';
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
};

const STYLE = `
:root {
  --paper: #eef1f4;
  --ink: #101a24;
  --soft: #55636f;
  --rule: #c8d2da;
  --onair: #c8102e;
  --healthy: #1f6f4a;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--paper);
  color: var(--ink);
  font: 16px/1.5 ui-sans-serif, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-variant-numeric: tabular-nums;
  padding: 40px 20px 80px;
}
main { max-width: 60rem; margin: 0 auto; }
h1 {
  font-size: 1.05rem;
  font-weight: 600;
  letter-spacing: 0.14em;
  margin: 0 0 4px;
}
h2 {
  font-size: 1.6rem;
  font-weight: 600;
  letter-spacing: -0.01em;
  margin: 0;
}
.masthead {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 24px;
  flex-wrap: wrap;
  border-bottom: 2px solid var(--ink);
  padding-bottom: 10px;
}
.masthead p { margin: 0; color: var(--soft); font-size: 0.85rem; }
.strip { margin: 0 0 56px; border-bottom: 1px solid var(--rule); }
.strip-row {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 8px 20px;
  align-items: baseline;
  padding: 12px 0;
  border-top: 1px solid var(--rule);
}
.strip-row:first-child { border-top: none; }
.strip-name { font-weight: 600; }
.strip-sub { color: var(--soft); font-size: 0.85rem; }
.strip-when { text-align: right; white-space: nowrap; }
.dot {
  width: 9px; height: 9px; border-radius: 50%;
  background: var(--healthy); display: inline-block;
}
.dot.bad { background: var(--onair); }
section { margin: 0 0 56px; }
.head { border-bottom: 2px solid var(--ink); padding-bottom: 8px; margin-bottom: 4px; }
.head p { margin: 4px 0 0; color: var(--soft); font-size: 0.85rem; }
ol { list-style: none; margin: 0; padding: 0; }
li.song {
  display: grid;
  grid-template-columns: 3.5rem 1fr auto;
  gap: 0 16px;
  align-items: baseline;
  padding: 10px 0;
  border-bottom: 1px solid var(--rule);
}
.rank { font-size: 1.5rem; font-weight: 600; color: var(--rule); text-align: right; }
li.song:first-child .rank { color: var(--onair); }
.title { font-weight: 600; }
.artist { grid-column: 2; color: var(--soft); font-size: 0.85rem; }
.plays { font-size: 1.15rem; white-space: nowrap; }
.plays span { color: var(--soft); font-size: 0.8rem; }
table { width: 100%; border-collapse: collapse; }
th {
  text-align: left; font-weight: 600; font-size: 0.85rem; color: var(--soft);
  padding: 8px 24px 8px 0; border-bottom: 1px solid var(--rule);
}
td {
  padding: 10px 24px 10px 0;
  border-bottom: 1px solid var(--rule);
  vertical-align: baseline;
}
th:last-child, td:last-child { padding-right: 0; }
td.num, th.num { text-align: right; white-space: nowrap; }
td.bad { color: var(--onair); }
.empty { color: var(--soft); padding: 18px 0; border-bottom: 1px solid var(--rule); }
@media (max-width: 540px) {
  li.song { grid-template-columns: 2.5rem 1fr; }
  .plays { grid-column: 2; font-size: 1rem; }
}
`;

/** Says whether every song the page offered made it into the playlist. */
const resultOf = (run: ChartRun): string => {
  if (run.error !== null) return escape(run.error);
  if (run.entriesSeen === null || run.tracksWritten === null) return 'written';
  const missing = run.entriesSeen - run.tracksWritten;
  return missing === 0 ? 'all found on Spotify' : `${missing} not found on Spotify`;
};

const songList = (songs: TopSong[]): string => {
  if (songs.length === 0) {
    return '<p class="empty">No plays collected for this week yet. Run a crawl to fill it.</p>';
  }
  const items = songs
    .map(
      (s) => `<li class="song">
      <div class="rank">${s.rank}</div>
      <div class="title">${escape(s.title)}</div>
      <div class="plays">${s.plays}<span>×</span></div>
      <div class="artist">${escape(s.primaryArtist)}</div>
    </li>`,
    )
    .join('\n');
  return `<ol>\n${items}\n</ol>`;
};

export const renderReport = (model: ReportModel): string => {
  const now = new Date(model.generatedAt);

  const stripRow = (
    name: string,
    playlistName: string,
    lastUpdatedAt: string | null,
    tracksWritten: number | null,
  ): string => `<div class="strip-row">
      <div>
        <div class="strip-name">${escape(name)}</div>
        <div class="strip-sub">${escape(playlistName)}${
          tracksWritten === null ? '' : ` — ${tracksWritten} tracks`
        }</div>
      </div>
      <div class="strip-when">
        <div>${formatMoment(lastUpdatedAt)}</div>
        <div class="strip-sub">${ageOf(lastUpdatedAt, now)}</div>
      </div>
      <div><span class="dot${isStale(lastUpdatedAt, now) ? ' bad' : ''}"></span></div>
    </div>`;

  const strip = [
    ...model.charts.map((c) => stripRow(c.name, c.playlistName, c.lastUpdatedAt, c.tracksWritten)),
    ...model.stations.map((s) =>
      stripRow(s.name, s.playlistName, s.lastUpdatedAt, s.tracksWritten),
    ),
  ].join('\n');

  const chartSections = model.charts
    .map((c) => {
      const rows =
        c.runs.length === 0
          ? '<tr><td colspan="4" class="empty">No runs recorded yet.</td></tr>'
          : c.runs
              .map(
                (r) => `<tr>
          <td>${formatMoment(r.finishedAt)}</td>
          <td class="num">${r.entriesSeen === null ? '—' : r.entriesSeen}</td>
          <td class="num">${r.tracksWritten === null ? '—' : r.tracksWritten}</td>
          <td class="${r.error === null ? '' : 'bad'}">${resultOf(r)}</td>
        </tr>`,
              )
              .join('\n');
      return `<section>
      <div class="head">
        <h2>${escape(c.name)}</h2>
        <p>Replaces “${escape(c.playlistName)}” with the chart in its published order — the ranked twenty, then the suggestions below them.</p>
      </div>
      <table>
        <thead><tr><th>Run</th><th class="num">On the page</th><th class="num">Found</th><th>Result</th></tr></thead>
        <tbody>
${rows}
        </tbody>
      </table>
    </section>`;
    })
    .join('\n');

  const stationSections = model.stations
    .map(
      (s) => `<section>
      <div class="head">
        <h2>${escape(s.name)}</h2>
        <p>“${escape(s.playlistName)}” — updated ${formatMoment(s.lastUpdatedAt)}</p>
      </div>
      ${songList(s.songs)}
    </section>`,
    )
    .join('\n');

  const unmatchedRows =
    model.unmatched.length === 0
      ? '<tr><td colspan="4" class="empty">Every song found a match.</td></tr>'
      : model.unmatched
          .map(
            (u) => `<tr>
        <td>${escape(u.title)}</td>
        <td>${escape(u.artist)}</td>
        <td>${escape(u.station)}</td>
        <td class="num">${u.occurrences}</td>
      </tr>`,
          )
          .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Radiofy report</title>
<style>${STYLE}</style>
</head>
<body>
<main>
  <div class="masthead">
    <div>
      <h1>RADIOFY</h1>
      <p>Playlists, airplay and the songs that got away</p>
    </div>
    <p>${formatMoment(model.generatedAt)} · ${DISPLAY_TZ}</p>
  </div>

  <div class="strip">
${strip}
  </div>

${chartSections}

${stationSections}

  <section>
    <div class="head">
      <h2>Not found on Spotify</h2>
      <p>The most persistent misses. Correcting one in storage/overrides.json fixes it everywhere.</p>
    </div>
    <table>
      <thead><tr><th>Title</th><th>Artist</th><th>Station</th><th class="num">Seen</th></tr></thead>
      <tbody>
${unmatchedRows}
      </tbody>
    </table>
  </section>
</main>
</body>
</html>
`;
};
