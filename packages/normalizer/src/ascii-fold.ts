const POLISH_MAP: Record<string, string> = {
  ł: 'l',
  Ł: 'l',
  ą: 'a',
  Ą: 'a',
  ć: 'c',
  Ć: 'c',
  ę: 'e',
  Ę: 'e',
  ń: 'n',
  Ń: 'n',
  ó: 'o',
  Ó: 'o',
  ś: 's',
  Ś: 's',
  ź: 'z',
  Ź: 'z',
  ż: 'z',
  Ż: 'z',
};

const POLISH_PATTERN = /[łŁąĄćĆęĘńŃóÓśŚźŹżŻ]/g;

export const asciiFold = (input: string): string => {
  const polishStripped = input.replace(POLISH_PATTERN, (c) => POLISH_MAP[c] ?? c);
  return polishStripped.normalize('NFD').replace(/\p{M}/gu, '');
};
