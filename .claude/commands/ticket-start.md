---
description: Move a ticket from todo to in-progress and start work
argument-hint: <ticket-id>
---

Start work on ticket `$ARGUMENTS`.

1. Find the ticket file for `$ARGUMENTS` in `docs/ticket/backlog/todo/`. If nothing matches, stop and list what *is* in `todo/`.
2. Move the file to `docs/ticket/backlog/in-progress/`.
3. Read the moved ticket in full.
4. Summarise `Type`, `Risk`, `Scope` (in / out) and the `Acceptance Criteria`. If `Risk: high`, state clearly that an external review is required before this ticket can reach `done`.

Then stop and wait for my go-ahead before changing any code.
