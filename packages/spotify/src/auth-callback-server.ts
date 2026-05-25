import { type Server, createServer } from 'node:http';

export type CallbackResult = { kind: 'ok'; code: string } | { kind: 'error'; reason: string };

export interface CallbackServer {
  readonly url: string;
  readonly result: Promise<CallbackResult>;
  close(): void;
}

export const startCallbackServer = (port: number, expectedState: string): CallbackServer => {
  let resolveResult!: (result: CallbackResult) => void;
  const result = new Promise<CallbackResult>((resolve) => {
    resolveResult = resolve;
  });

  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
    if (url.pathname !== '/callback') {
      res.writeHead(404).end();
      return;
    }
    const gotState = url.searchParams.get('state');
    const code = url.searchParams.get('code');
    if (gotState === null || gotState !== expectedState) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('state mismatch');
      resolveResult({ kind: 'error', reason: 'state mismatch' });
      return;
    }
    if (code === null || code === '') {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('no code');
      resolveResult({ kind: 'error', reason: 'no code' });
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK — you can close this browser tab.');
    resolveResult({ kind: 'ok', code });
  });

  server.listen(port, '127.0.0.1');

  return {
    url: `http://127.0.0.1:${port}/callback`,
    result,
    close: (): void => {
      server.close();
    },
  };
};
