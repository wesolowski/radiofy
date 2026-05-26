# RDFY-016 — CLAUDE.md: formalize "everything is a ticket" rule

**Status**: done
**Reviewer decision**: APPROVED
**Branch**: `rdfy-016-ticket-driven-rule`
**PR**: https://github.com/wesolowski/radiofy/pull/18
**Risk**: low (docs-only)

## What was delivered

- `.claude/CLAUDE.md` → `Workflow → Ground rules`: rule 2 strengthened to explicitly require a ticket for **bug-fixes, follow-ups, docs, and one-line changes**, with the instruction to write the ticket first under `docs/ticket/backlog/in-progress/` when none exists.
- New `Implementer fast path` subsection that documents the five-step flow: write ticket in `in-progress/` → branch + implement + Quality Gate → `git mv` ticket to `review/` → commit/push/PR → dispatch reviewer.
- Slow path (`/ticket-start` + manual pause) preserved as the documented choice for high-risk or unclear-scope work.

## Files changed

- `.claude/CLAUDE.md` (+12/-1)
- `docs/ticket/backlog/done/RDFY-016_ticket-driven-rule.md` (moved from `review/`)

## Acceptance criteria

- [x] Ground rule 2 now mentions bug-fixes, follow-ups, docs, one-line changes
- [x] `Implementer fast path` subsection with the five-step flow present
- [x] `/ticket-start` slow path preserved as the alternative for high-risk / unclear-scope work
- [x] Only `.claude/CLAUDE.md` and the ticket file changed in the commit (`git diff main..HEAD --stat` = 2 files)
- [x] `bunx tsc --noEmit` clean, `bunx biome check .` clean (116 files), `bun test` 245 pass / 1 skip / 0 fail

## Quality gate

- TypeScript: clean (`bunx tsc --noEmit` — no output)
- Biome: clean (`bunx biome check .` — 116 files, no fixes)
- Tests: 245 pass / 1 skip / 0 fail across 36 files (7.42s)

## Confidentiality

Diff contains no references to Claude, AI, or LLM. Only neutral terms ("implementer", "reviewer", "ticket flow") that match the existing project vocabulary.
