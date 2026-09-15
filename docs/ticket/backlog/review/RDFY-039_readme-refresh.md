# RDFY-039 The README describes an earlier version of the project

## Type
bug

## Risk
low

## Priority
medium

## Status
review

## Owner
implementer

## Background
The README has fallen behind the project it introduces. A reader meets a status
line claiming thirteen merged tickets when there are thirty-eight, an overview
describing a single pipeline when there are two, and a Quickstart telling them
to write a configuration file that now ships filled in.

None of it is wrong in a way that breaks anything, which is why it survived —
it just quietly misinforms the first person to read it.

## Symptom
- The status line states a ticket count that has been wrong for weeks.
- "What it does" describes only the station pipeline; nothing says the project
  also syncs a chart, so a reader has no reason to look for `bun run chart`.
- Quickstart step 4 instructs the reader to fill `config/stations.json`, which
  has shipped populated since RDFY-028, and never mentions `config/charts.json`
  at all.
- Quickstart ends at a single station sync, though `weekly` now does the whole
  round, and never points at the report page.

## Scope
- **In scope**: the status line, the "What it does" overview, and the
  Quickstart.
- **Out of scope (explicit)**:
  - The CLI command reference, which is current — every command added this
    cycle documented itself as it landed.
  - `docs/operations/runbook.md` and the architecture document.
  - Any change to code or configuration.

## References
- `README.md`
- `config/stations.json`, `config/charts.json`

## Acceptance Criteria
- [ ] No claim about how many tickets are merged. A status line that goes stale
      the moment it is written should not be there.
- [ ] The overview describes both paths: the station play log and the chart
      snapshot, and says plainly how they differ.
- [ ] The Quickstart reflects that both configuration files ship with the
      repository: stations populated, charts empty.
- [ ] The Quickstart's first run is `bun run weekly`, and it ends by pointing
      at `bun run report`.
- [ ] Every command named in the Quickstart exists in `package.json`.

## Verification (manual)
1. Read the README top to bottom as a newcomer → nothing describes a version of
   the project that no longer exists.
2. Follow the Quickstart on a fresh clone → every step is doable and every
   command resolves.
