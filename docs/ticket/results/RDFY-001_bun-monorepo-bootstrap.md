# [RDFY-001] Bun monorepo bootstrap — Result

## Status
Done — approved on review.

## Summary
Scaffolded the Bun + TypeScript monorepo: root workspaces, shared `tsconfig.base.json` (strict + `noUncheckedIndexedAccess`), Biome config, six packages under `packages/*`, the worker app under `apps/worker`, and the test-layer convention (`packages/*/test` for unit, `tests/integration` for env-gated integration). All worker subcommands are wired as `bun run <name>` placeholders that print `not implemented yet: <cmd>` and exit 0.

## Files added / changed
- Root: `package.json`, `tsconfig.json`, `tsconfig.base.json`, `biome.json`, `bun.lock`, `.env.example`, `.gitignore` (already present, verified)
- Apps: `apps/worker/package.json`, `apps/worker/tsconfig.json`, `apps/worker/commands/{sync,crawl,spotify-auth,overrides-validate,export-unmatched,export-playlist,status,prune-audit}.ts`
- Packages (each with `package.json`, `tsconfig.json`, `src/index.ts`): `@radiofy/shared`, `@radiofy/sources`, `@radiofy/spotify`, `@radiofy/normalizer`, `@radiofy/matcher`, `@radiofy/database`
- Tests: `packages/shared/test/bootstrap.test.ts`, `tests/integration/bootstrap.test.ts`
- Config: `config/stations.json` (`[]`)
- Docs: `.claude/CLAUDE.md` — documents the two-layer test convention; `docs/html/test.html` preserved

## Verification (all green, Bun 1.3.14)
- `bun install` — clean, no changes
- `bunx tsc --noEmit` — exit 0
- `bunx biome check .` — 36 files, no issues
- `bun test` — 1 pass, 1 skip, 0 fail
- `bun run --filter @radiofy/shared build` — exit 0
- `bun run test:unit` — 1 pass, exit 0
- `bun run test:integration` (no env) — 1 skip, exit 0
- `RADIOFY_INTEGRATION=1 bun run test:integration` — 1 pass, exit 0
- Each `bun run <sync|crawl|spotify:auth|overrides:validate|export-unmatched|export-playlist|status|prune-audit>` — prints placeholder, exits 0
- `.gitignore` excludes `storage/`, `node_modules/`, `*.db`, `*.log`, `.env*` with `!.env.example`
- `git ls-files storage/` empty — directories present locally only
- Confidentiality hook dry-run on a fake commit payload — exit 0
- No `any`, no `@ts-ignore`, no inline comments in source

## Notes for follow-ups
- `packages/shared/test/bootstrap.test.ts` and `tests/integration/bootstrap.test.ts` are placeholders to keep both test runners green; replace once RDFY-002 / RDFY-006 land.
- All package `src/index.ts` are `export {};` placeholders.
