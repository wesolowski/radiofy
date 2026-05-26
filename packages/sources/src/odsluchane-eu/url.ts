const BASE = 'https://www.odsluchane.eu/szukaj.php';

const toDDMMYYYY = (yyyymmdd: string): string => {
  const parts = yyyymmdd.split('-');
  const y = parts[0];
  const m = parts[1];
  const d = parts[2];
  if (y === undefined || m === undefined || d === undefined) {
    throw new Error(`odsluchane-eu: invalid date '${yyyymmdd}', expected YYYY-MM-DD`);
  }
  return `${d}-${m}-${y}`;
};

export const buildUrl = (stationId: string, day: string, hourFrom = 0, hourTo = 24): string => {
  const params = new URLSearchParams({
    r: stationId,
    date: toDDMMYYYY(day),
    time_from: String(hourFrom),
    time_to: String(hourTo),
  });
  return `${BASE}?${params.toString()}`;
};
