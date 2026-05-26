# [RDFY-016] CLAUDE.md — formalize the "everything is a ticket" rule

## Type
refactor

## Risk
low

## Priority
medium

## Status
review

## Owner
implementer

## Background
The session repeatedly produced changes (bug-fixes, doc tweaks, small enhancements) without first creating a ticket file — the work was done, then the ticket was synthesized after the fact. The operator wants the rule made explicit: **every change is a ticket, including small fixes**, and the implementer may move the ticket straight to `review/` once the work is finished and the Quality Gate is green.

## Scope
- **In scope**:
  - Tighten the existing `Ground rules → 2` in `.claude/CLAUDE.md` so "from a backlog ticket" explicitly covers small fixes, follow-ups, and doc-only changes.
  - Add an `Implementer fast path` subsection describing the five-step flow that bypasses the explicit `/ticket-start` pause and goes ticket-create → implement → review.
  - Keep the slow path (`/ticket-start`) for high-risk / unclear-scope work.
- **Out of scope (explicit)**: changing any code, the architecture document, the agent definitions, or the slash-command files. This is a CLAUDE.md text edit only.

## References
- `.claude/CLAUDE.md` → `Workflow → Ground rules`
- `.claude/commands/ticket-start.md`, `ticket-review.md`, `ticket-done.md`

## Acceptance Criteria
- [ ] Ground rule 2 in CLAUDE.md says explicitly that small fixes need a ticket too
- [ ] An "Implementer fast path" subsection lists the five-step flow
- [ ] The slow path (`/ticket-start`) is preserved as the alternative for higher-risk / unclear-scope work
- [ ] No other files are changed
- [ ] `bunx tsc --noEmit`, `bunx biome check .`, `bun test` all clean (no regression possible since this is doc-only)

## Verification (manual)
1. `git diff main` shows only `.claude/CLAUDE.md` and the ticket files.
2. A first-time reader of CLAUDE.md can identify the fast-path flow without needing to read other documents.
