import { runOverridesValidate } from '../lib/overrides-validate.ts';

const main = (): void => {
  const outcome = runOverridesValidate();
  if (outcome.kind === 'error') process.exit(1);
};

main();
