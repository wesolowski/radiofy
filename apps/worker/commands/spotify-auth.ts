import { loadConfig, logger } from '@radiofy/shared';
import { buildAuthRequest, exchangeCode, startCallbackServer, writeAuth } from '@radiofy/spotify';

const CALLBACK_PORT = 8888;

const main = async (): Promise<void> => {
  const config = loadConfig();
  const { authUrl, state, verifier } = buildAuthRequest();

  process.stdout.write('Open this URL in your browser to authenticate:\n');
  process.stdout.write(`${authUrl}\n\n`);
  process.stdout.write(
    `Listening for the callback on http://127.0.0.1:${CALLBACK_PORT}/callback\n`,
  );

  const server = startCallbackServer(CALLBACK_PORT, state);
  const result = await server.result;
  server.close();

  if (result.kind === 'error') {
    logger.error('spotify:auth callback rejected', { reason: result.reason });
    process.exit(1);
  }

  const tokens = await exchangeCode({ code: result.code, verifier });
  writeAuth({
    refresh_token: tokens.refresh_token,
    scopes: tokens.scope.split(' ').filter((s) => s.length > 0),
    obtained_at: new Date().toISOString(),
    client_id_hint: config.SPOTIFY_CLIENT_ID.slice(-4),
  });

  logger.info('spotify:auth complete — refresh token persisted', {
    path: 'storage/auth/spotify.json',
  });
};

await main();
