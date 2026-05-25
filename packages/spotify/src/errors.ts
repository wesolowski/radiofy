export class SpotifyAuthExpiredError extends Error {
  constructor(
    message = 'Spotify refresh token rejected — run `bun run spotify:auth` to re-authenticate.',
  ) {
    super(message);
    this.name = 'SpotifyAuthExpiredError';
  }
}

export class SpotifyTransientError extends Error {
  readonly status: number | undefined;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'SpotifyTransientError';
    this.status = status;
  }
}
