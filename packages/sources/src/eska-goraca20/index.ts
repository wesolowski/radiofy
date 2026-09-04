import { type ChartEntry, type ChartParseInput, parseChart } from './parse.ts';

export const ESKA_GORACA20_ID = 'eska-goraca20' as const;

export const eskaGoraca20Source = {
  id: ESKA_GORACA20_ID,
  parseChart,
} as const;

export { parseChart };
export type { ChartEntry, ChartParseInput };
