# [RDFY-010] Manual overrides — JSON loader, validator, resolver

## Type
feature

## Risk
medium

## Priority
high

## Status
todo

## Owner
implementer

## Background
Operators need a way to fix wrong matches and rescue genuinely missing songs without editing the database. The architecture specifies a single `storage/overrides.json` file with three match modes, strict resolution order, and fail-fast validation.

## Scope
- **In scope**:
  - `packages/matcher/overrides.ts`: `loadOverrides(path) → OverrideTable` — parses JSON, validates against schema, throws on conflict
  - `OverrideTable.resolve(song) → spotifyTrackId | null` — applies the three-mode resolution order
  - Schema validation (Zod or hand-written): `match` must contain one of `{source,source_track_id}` | `{normalized_key}` | `{artist,title}`; `spotify_id` must match the Spotify URI shape
  - Conflict detection: same match block resolves to two different `spotify_id`s → throw; two entries at the same priority level for the same song → throw
  - File missing → empty table, no error (no overrides is a valid state)
  - File present but invalid JSON or invalid schema → throw with the offending entry index and path
- **Out of scope (explicit)**: CLI command (that's in RDFY-012), upserting cache rows (RDFY-009 does that), watching the file for changes (load once per process invocation).

## References
- `docs/architecture/PROJECT_ARCHITECTURE.md` → "Manual Overrides"
- `RDFY-002`, `RDFY-005`

## Acceptance Criteria
- [ ] Missing `storage/overrides.json` → `loadOverrides` returns an empty table **and logs at `info` level** `"no overrides file found at storage/overrides.json"` so operators can distinguish "no file" from "valid empty file" in logs
- [ ] Invalid JSON → throws with file path and parser error
- [ ] Match block with zero of the three discriminators → throws with `overrides[N]` path
- [ ] Invalid `spotify_id` (not matching `spotify:track:[A-Za-z0-9]{22}`) → throws
- [ ] Two override entries for the same `(source, source_track_id)` with different `spotify_id` → throws with both entry indices
- [ ] Resolution order test: a song that matches all three modes returns the `(source, source_track_id)` mapping
- [ ] `(artist, title)` mode is re-normalized at load time so user-friendly diacritic forms work
- [ ] `bun test packages/matcher/test/overrides/` covers all of the above

## Verification (manual)
1. Author a file with all three match modes for distinct songs → `loadOverrides` succeeds, `resolve` returns the right ID for each
2. Add a conflicting entry → loader throws with both entry indices in the message
3. Delete the file → next process start succeeds, no overrides applied
4. `bun run overrides:validate` (added in RDFY-012) prints "OK" for a valid file
