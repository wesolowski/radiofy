# [RDFY-021] Server deployment docs — what to configure on the host

## Type
feature

## Risk
low

## Priority
medium

## Status
review

## Owner
implementer

## Background
The runbook covers "first-time setup" assuming the operator is sitting at the same machine the worker will run on. Deploying to a remote Linux server (the typical production target) has two extra hurdles that are not documented anywhere:

1. **Headless OAuth.** `bun run spotify:auth` opens a browser and listens on `127.0.0.1:8888`. On a remote server there is no browser. The operator needs to either SSH-tunnel the callback port to their laptop or run the auth flow locally and copy `storage/auth/spotify.json` to the server.
2. **Server prerequisites** (Bun install, system timezone, persistent directories, file permissions, log rotation) are scattered across the README, the runbook, and the crontab example. There is no single "do these things on the host" checklist.

The result is that anyone deploying Radiofy on a new server has to read three documents and reverse-engineer the OAuth hop themselves.

## Scope
- **In scope**:
  - Add a "Server deployment" section to `docs/operations/runbook.md` covering: prerequisites (Bun, git, timezone, user account), the SSH-port-forward and auth-then-copy workarounds for headless OAuth, persistent state directories under `storage/`, file-permission expectations on the auth token, a step-by-step server checklist, and log rotation.
  - Update `README.md` to point at the new runbook section from the "Run it" area, so people landing on the repo find the server flow without hunting.
- **Out of scope (explicit)**: Container / Docker setup; Ansible / systemd-hardening guides; reverse proxies; secrets-management tooling integrations. Operators who use those tools translate the checklist themselves.

## References
- `docs/operations/runbook.md` — first-time setup, scheduling
- `docs/operations/cron/crontab.example` — server-side schedule
- `packages/spotify/src/auth.ts` — PKCE callback listens on `127.0.0.1:8888`
- `README.md` — public entry point

## Acceptance Criteria
- [ ] `docs/operations/runbook.md` contains a top-level "Server deployment" section that lists, in order: server prerequisites, headless-OAuth options (SSH port forward + auth-then-copy), persistent state under `storage/`, file-permission check on `storage/auth/spotify.json`, log rotation hint, and a numbered server checklist
- [ ] The SSH-port-forward block shows the literal command (`ssh -L 8888:127.0.0.1:8888 <user>@<host>`) and explains which side runs `bun run spotify:auth`
- [ ] The auth-then-copy block shows `scp storage/auth/spotify.json <user>@<host>:<path>/storage/auth/spotify.json` and the `chmod 0600` that follows
- [ ] `README.md` "Run it" section has a one-line pointer to the new runbook section
- [ ] `bunx biome check` exits clean
- [ ] No code changes — docs only; `bun test` and `bunx tsc --noEmit` remain unchanged

## Verification (manual)
1. Open `docs/operations/runbook.md`, jump to "Server deployment" → section is present, ordered as above, both OAuth variants documented → expected: yes
2. `grep -n "Server deployment" README.md` → expected: one pointer line into the runbook
3. `bunx biome check docs/operations/runbook.md README.md` → expected: clean (markdown is not formatted by biome, but the run should not error)
