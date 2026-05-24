const BASE = 'https://malopolskie-media.info';

export const buildUrl = (slug: string, day: string, hourFrom = 0, hourTo = 24): string =>
  `${BASE}/playlista/${slug}/${day}/${hourFrom}/${hourTo}.html`;
