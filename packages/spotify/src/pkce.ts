import { createHash, randomBytes } from 'node:crypto';

const VERIFIER_BYTES = 64;
const STATE_BYTES = 32;

export const generateVerifier = (): string => randomBytes(VERIFIER_BYTES).toString('base64url');

export const generateChallenge = (verifier: string): string =>
  createHash('sha256').update(verifier).digest('base64url');

export const generateState = (): string => randomBytes(STATE_BYTES).toString('base64url');
