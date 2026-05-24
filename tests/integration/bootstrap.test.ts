import { expect, test } from 'bun:test';

const integrationEnabled = process.env['RADIOFY_INTEGRATION'] === '1';

test.skipIf(!integrationEnabled)('integration placeholder — replace once RDFY-006 lands', () => {
  expect(true).toBe(true);
});
