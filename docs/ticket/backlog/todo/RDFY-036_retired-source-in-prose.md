# RDFY-036 Prose still presents the retired source as current

## Type
bug

## Risk
low

## Priority
low

## Status
todo

## Background
RDFY-033 corrected the two station-configuration examples, but only those. The
surrounding prose in the README and the architecture document still describes
`malopolskie-media.info` as the source the project uses — in the pipeline
summary a reader meets first, in a "Data source" heading, and in two statements
about what the MVP relies on. That source has been unreachable since 2026-05
and was replaced by `odsluchane-eu` in RDFY-015.

A reader who never reaches the "deprecated" section 300 lines down comes away
with the wrong idea of what the project talks to.

## Scope
- **In scope**: the places that present the retired source as current —
  `README.md` pipeline step 1 and its "Data source" section, and the two
  "the MVP relies on / covers" statements in the architecture document. Also
  the two copyable examples that still name it: the manual-override example and
  the SQL column comment.
- **Out of scope (explicit)**: the "malopolskie-media.info (deprecated)"
  section and the historical note explaining the switch, both of which are
  correct records; the parser, its fixtures and tests; the package-tree
  listings, which describe files that exist.

## References
- `README.md` (pipeline summary; "Data source")
- `docs/architecture/PROJECT_ARCHITECTURE.md` (MVP statements; override
  example; schema comment)

## Acceptance Criteria
- [ ] No passage outside the deprecated section and the historical note
      presents `malopolskie-media.info` as the source in use.
- [ ] The copyable override example and the schema comment name the active
      source.
- [ ] The deprecated section, the historical note, the parser and its tests are
      unchanged.

## Verification (manual)
1. Read `README.md` top to bottom → the source named is the one the worker
   actually reaches.
2. `git grep -n malopolskie docs README.md` → every remaining hit is inside the
   deprecated section, the historical note, or a file-tree listing.
