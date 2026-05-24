# [TICKET-ID] Title

## Type
feature | bug | refactor

## Risk
high | medium | low

> `high` → external review required before `done` (see `agents/reviewer.md`).

## Priority
high | medium | low

## Status
todo | in-progress | review | done

## Owner
implementer | reviewer | tester

## Background
Why is this change needed? What problem does it solve? Business perspective,
no implementation detail — this text feeds the PR description later.

## Symptom (bugs only)
Observable behavior and concrete reproduction steps.

## Scope
- **In scope**: ...
- **Out of scope (explicit)**: ...

## References
- `<path/to/relevant/source/file>`

## Acceptance Criteria
Concrete and verifiable — name the input and the expected output, not a goal:

- [ ] `POST /api/x` with payload `Y` returns `201` + entity `Z`
- [ ] Duplicate id → `409` with body `{"error": "..."}`
- [ ] `bun test packages/<pkg>/test/<name>.test.ts` passes

## Verification (manual)
Steps a reviewer can replay, each with its expected result:

1. <action> → <expected result>
2. <action> → <expected result>
