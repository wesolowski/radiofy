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

/**
 * Every station id in the site's own selector is an integer. A slug-style value
 * — which older documentation taught — is answered with the landing page and
 * HTTP 200, so without this the crawl records a healthy run that found nothing.
 */
export const buildUrl = (stationId: string, day: string, hourFrom = 0, hourTo = 24): string => {
  if (!/^\d+$/.test(stationId)) {
    throw new Error(
      `odsluchane-eu: invalid station id '${stationId}', expected the site's numeric r= value`,
    );
  }
  const params = new URLSearchParams({
    r: stationId,
    date: toDDMMYYYY(day),
    time_from: String(hourFrom),
    time_to: String(hourTo),
  });
  return `${BASE}?${params.toString()}`;
};
