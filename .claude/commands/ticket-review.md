---
description: Hand a finished ticket over to review
argument-hint: <ticket-id>
---

Move ticket `$ARGUMENTS` to review.

1. Find the ticket file for `$ARGUMENTS` in `docs/ticket/backlog/in-progress/`. If nothing matches, stop and list what *is* in `in-progress/`.
2. Check the Definition of Done from `CLAUDE.md`: Quality Gate green, every acceptance criterion met, no inline comments, file header in every new source file. If anything is open, stop and list it — do not move the ticket.
3. Move the file to `docs/ticket/backlog/review/`.
4. Confirm it is ready for review and note whether an external review is required (`Risk: high`).
