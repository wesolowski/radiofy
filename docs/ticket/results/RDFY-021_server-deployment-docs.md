# RDFY-021 — Server deployment docs

## Outcome
Approved. Runbook now carries a self-contained "Server deployment" section covering server prerequisites, both headless-OAuth paths (SSH port forward + auth-then-copy), persistent `storage/` layout, token permissions, log rotation, and a 10-step server checklist. README points operators at the new section from the Quickstart.

## Files changed
- `docs/operations/runbook.md` — new "Server deployment" section inserted between "Monthly housekeeping" and "Scheduling".
- `README.md` — Quickstart pointer to the new section and an extra bullet under `docs/operations/` description.

## Acceptance criteria
- Server deployment section present, ordered as required.
- SSH port-forward block shows literal `ssh -L 8888:127.0.0.1:8888 <user>@<host>` and clarifies which side runs `bun run spotify:auth`; consent URL is pasted in the local browser; redirect tunnels back to the server's listener.
- Auth-then-copy block shows `scp storage/auth/spotify.json <user>@<host>:.../storage/auth/spotify.json` followed by `chmod 0600`.
- README "Run it" / Quickstart links into `docs/operations/runbook.md#server-deployment`; anchor resolves.

## Verification
- `bunx biome check .` — clean (122 files, no fixes).
- `bunx tsc --noEmit` — clean.
- `bun test` — 264 pass / 1 skip / 0 fail.
- Manual: AI-authorship phrases, secrets, tokens scan — clean.
- Confidentiality / public-repo hygiene — no PII, no secrets, no log/db snapshots.
