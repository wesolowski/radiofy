# RDFY-033 — Configuration examples still showed the blocked source

## Outcome
Approved after one round. Both station-configuration examples now name the
source the worker actually reaches, with the numeric slugs the shipped
configuration uses.

Before this, an operator following the runbook hand-built a configuration that
parsed, validated and crawled nothing, failing against a site that has been
behind a Cloudflare challenge since 2026-05 — and which the setup steps never
mentioned as retired.

## Files changed
- `docs/operations/runbook.md` — the first-time-setup example, an explanation
  of where the number comes from, and the playlist names the shipped
  configuration expects.
- `docs/architecture/PROJECT_ARCHITECTURE.md` — the configuration example and a
  bullet describing `sourceSlug`.

## Review findings addressed
- The architecture example never explained `sourceSlug`; the nearest
  explanation was eighty lines away with no pointer, so a reader had no way to
  know what a fifth station's value would be.
- Its second entry carried a station name and playlist name that no longer
  matched the shipped file, which made the commit's claim of matching "field
  for field" untrue. Both were aligned, and the setup step now names the four
  playlists the configuration actually expects instead of a recommendation that
  contradicted it.

## Verified rather than assumed
The runbook example was parsed out of the document, compared field by field
against `config/stations.json`, then installed as the configuration and run
through `bun run status`, which listed exactly that station. The real
configuration was restored and its four stations counted afterwards.

## Deliberately untouched
The `malopolskie-media` parser, its fixtures and tests — it still works and
would be needed if that site became reachable again — along with the
"malopolskie-media.info (deprecated)" section and the historical note
explaining the switch.

Review found further prose that still presents the retired source as current,
in the README's pipeline summary and two statements in the architecture
document. That is outside this ticket's scope and went to RDFY-036.

## Verification
- `bunx tsc --noEmit` — exit 0. `bun test` — 323 pass / 1 skip / 0 fail.
