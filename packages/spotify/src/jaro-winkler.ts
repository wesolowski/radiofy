const PREFIX_SCALE = 0.1;
const PREFIX_MAX = 4;

const jaroSimilarity = (a: string, b: string): number => {
  if (a === b) return 1;
  const lenA = a.length;
  const lenB = b.length;
  if (lenA === 0 || lenB === 0) return 0;

  const matchWindow = Math.max(0, Math.floor(Math.max(lenA, lenB) / 2) - 1);
  const matchedA = new Array<boolean>(lenA).fill(false);
  const matchedB = new Array<boolean>(lenB).fill(false);

  let matches = 0;
  for (let i = 0; i < lenA; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(lenB, i + matchWindow + 1);
    for (let j = start; j < end; j++) {
      if (matchedB[j]) continue;
      if (a[i] !== b[j]) continue;
      matchedA[i] = true;
      matchedB[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0;

  let k = 0;
  let transpositions = 0;
  for (let i = 0; i < lenA; i++) {
    if (!matchedA[i]) continue;
    while (!matchedB[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }

  const m = matches;
  return (m / lenA + m / lenB + (m - transpositions / 2) / m) / 3;
};

export const jaroWinkler = (a: string, b: string): number => {
  const j = jaroSimilarity(a, b);
  let prefix = 0;
  const limit = Math.min(PREFIX_MAX, a.length, b.length);
  for (let i = 0; i < limit; i++) {
    if (a[i] !== b[i]) break;
    prefix++;
  }
  return j + prefix * PREFIX_SCALE * (1 - j);
};
