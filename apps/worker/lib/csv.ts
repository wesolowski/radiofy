const NEEDS_QUOTING = /[",\r\n]/;

const quote = (value: string): string => {
  if (!NEEDS_QUOTING.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
};

export const csvCell = (value: string | number | null | undefined): string => {
  if (value === null || value === undefined) return '';
  return quote(String(value));
};

export const csvLine = (cells: ReadonlyArray<string | number | null | undefined>): string =>
  cells.map(csvCell).join(',');
