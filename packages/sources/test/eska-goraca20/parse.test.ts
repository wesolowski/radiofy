import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseChart } from '../../src/eska-goraca20/parse.ts';

const fixturesDir = join(import.meta.dir, 'fixtures');
const loadFixture = (name: string): string => readFileSync(join(fixturesDir, name), 'utf-8');

describe('parseChart: live Gorąca 20 fixture', () => {
  const html = loadFixture('goraca20.html');
  const entries = parseChart({ html });

  test('returns the ranked chart followed by the unranked proposals', () => {
    expect(entries).toHaveLength(45);

    const chart = entries.filter((e) => e.section === 'chart');
    const proposals = entries.filter((e) => e.section === 'proposal');
    expect(chart).toHaveLength(20);
    expect(proposals).toHaveLength(25);

    expect(chart.map((e) => e.position)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
    ]);
    expect(proposals.every((e) => e.position === null)).toBe(true);
  });

  test('ranks every chart entry before every proposal', () => {
    expect(entries.map((e) => e.rank)).toEqual(Array.from({ length: 45 }, (_, i) => i + 1));
    const lastChartRank = Math.max(
      ...entries.filter((e) => e.section === 'chart').map((e) => e.rank),
    );
    const firstProposalRank = Math.min(
      ...entries.filter((e) => e.section === 'proposal').map((e) => e.rank),
    );
    expect(lastChartRank).toBe(20);
    expect(firstProposalRank).toBe(21);
  });

  test('extracts artists, title and source id for the top entry', () => {
    expect(entries[0]).toMatchObject({
      rank: 1,
      position: 1,
      section: 'chart',
      title: "My Body Isn't Ready",
      artists: ['Sombr'],
      sourceTrackId: 'so-HwJu-LbXN-DxRH',
    });
  });

  test('keeps every credited artist, not just the first', () => {
    const dna = entries.find((e) => e.title === 'Dna (More Than a Game)');
    expect(dna).toBeDefined();
    expect(dna?.artists).toEqual(['Andrea Bocelli', 'David Guetta', 'Ejae', 'Megan Thee Stallion']);
    expect(entries.find((e) => e.title === 'Ty Masz')?.artists).toEqual(['Gibbs', 'Kukon']);
  });

  test('gives every entry a distinct source track id', () => {
    const ids = entries.map((e) => e.sourceTrackId);
    expect(ids.every((id) => /^so(-[A-Za-z0-9]{4}){3}$/.test(id))).toBe(true);
    expect(new Set(ids).size).toBe(45);
  });

  test('builds displayText as artists then title', () => {
    expect(entries[1]?.displayText).toBe('Gibbs, Kukon - Ty Masz');
  });
});

describe('parseChart: edge cases', () => {
  test('returns an empty list when the page carries no entries', () => {
    expect(parseChart({ html: '<html><body><p>nothing here</p></body></html>' })).toEqual([]);
  });

  test('skips an entry whose href carries no usable id instead of inventing one', () => {
    const html = `
      <div class="single-hit">
        <div class="single-hit__positions"><div class="single-hit__position">1</div></div>
        <div class="single-hit__info">
          <a href="/hit/broken-entry.html" class="single-hit__title">Keine ID</a>
          <ul><li><a href="/hit/broken-entry.html" class="single-hit__author">Nobody</a></li></ul>
        </div>
      </div>
      <div class="single-hit">
        <div class="single-hit__positions"><div class="single-hit__position">2</div></div>
        <div class="single-hit__info">
          <a href="/hit/good-so-AAAA-BBBB-CCCC.html" class="single-hit__title">Gute ID</a>
          <ul><li><a href="/hit/good-so-AAAA-BBBB-CCCC.html" class="single-hit__author">Somebody</a></li></ul>
        </div>
      </div>`;
    const entries = parseChart({ html });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      rank: 1,
      position: 2,
      title: 'Gute ID',
      sourceTrackId: 'so-AAAA-BBBB-CCCC',
    });
  });

  test('skips an entry without a title or without any artist', () => {
    const html = `
      <div class="single-hit">
        <div class="single-hit__info">
          <a href="/hit/x-so-AAAA-BBBB-CCCC.html" class="single-hit__title">Ohne Interpret</a>
          <ul></ul>
        </div>
      </div>
      <div class="single-hit">
        <div class="single-hit__info">
          <ul><li><a href="/hit/y-so-DDDD-EEEE-FFFF.html" class="single-hit__author">Ohne Titel</a></li></ul>
        </div>
      </div>`;
    expect(parseChart({ html })).toEqual([]);
  });
});
