# [RDFY-001] Bun monorepo bootstrap

## Type
feature

## Risk
low

## Priority
high

## Status
todo

## Owner
implementer

## Background
The repository contains only documentation and the `.claude/` workflow tooling. Before any application code can be written, the project needs a runnable Bun monorepo skeleton with strict TypeScript, Biome, and the directory layout described in `PROJECT_ARCHITECTURE.md` → "Project Structure". All later tickets depend on this one.

## Scope
- **In scope**:
  - Root `package.json` with Bun workspaces and the package-name convention `@radiofy/<pkg>` (e.g. `@radiofy/shared`, `@radiofy/sources`, ...)
  - `package.json` `scripts` block routing every worker subcommand to its file (placeholders are fine — implemented in later tickets):
    ```json
    "scripts": {
      "sync": "bun apps/worker/commands/sync.ts",
      "crawl": "bun apps/worker/commands/crawl.ts",
      "spotify:auth": "bun apps/worker/commands/spotify-auth.ts",
      "overrides:validate": "bun apps/worker/commands/overrides-validate.ts",
      "export-unmatched": "bun apps/worker/commands/export-unmatched.ts",
      "export-playlist": "bun apps/worker/commands/export-playlist.ts",
      "status": "bun apps/worker/commands/status.ts",
      "prune-audit": "bun apps/worker/commands/prune-audit.ts"
    }
    ```
  - `tsconfig.json` with `strict: true`, `noUncheckedIndexedAccess: true`, project references for each package
  - `biome.json`
  - Empty `apps/worker/commands/` and all `packages/*/src/` directories with placeholder `package.json` + `src/index.ts`
  - `config/stations.json` stub (empty `[]`)
  - `storage/` skeleton (`storage/db/`, `storage/logs/`, `storage/auth/` — all gitignored)
  - **Committed** `.env.example` listing every env var the project consumes (with empty values + one-line comments). The real `.env` is gitignored.
  - **Committed** `docs/html/` directory preserved (parser test fixtures live here per RDFY-004)
  - `.gitignore` covers `storage/`, `node_modules/`, `*.db`, `*.log`, `.env` (but **not** `.env.example`)
- **Out of scope (explicit)**: any business logic, database schema, Spotify integration, parser implementations. No code beyond `export {}` placeholders.

## References
- `docs/architecture/PROJECT_ARCHITECTURE.md` → "Project Structure", "Technology Stack"
- `.claude/CLAUDE.md` → "Code Quality Commands"

## Acceptance Criteria
- [ ] `bun install` succeeds on a fresh clone
- [ ] `bunx tsc --noEmit` exits 0
- [ ] `bunx biome check .` exits 0
- [ ] `bun test` exits 0 (no tests, no failures)
- [ ] Workspaces resolve: `bun --filter @radiofy/shared run build` works (even if it just runs `tsc --noEmit`)
- [ ] `.gitignore` excludes `storage/`, `node_modules/`, `*.db`, `*.log`, `.env` — but **not** `.env.example`
- [ ] `.env.example` is committed, lists `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_REDIRECT_URI`, `LOG_LEVEL` with empty values and one-line comments
- [ ] `docs/html/` directory exists and contains the seed fixture (`test.html`)
- [ ] `config/stations.json` is valid JSON, contains an empty `[]` placeholder
- [ ] `bun run sync` (and every other declared script) starts and prints a "not implemented yet" placeholder without crashing the script runner

## Verification (manual)
1. Fresh `git clean -fdx && bun install` → no errors
2. `bunx biome check .` → "Checked X files, no issues found"
3. `ls packages/` → all six packages present (`sources`, `spotify`, `normalizer`, `matcher`, `database`, `shared`)
4. `git status --ignored` → confirms `storage/` is ignored
