# RDFY-034 Ignore agent worktrees inside the checkout

## Type
bug

## Risk
low

## Priority
low

## Status
review

## Owner
implementer

## Background
Tooling that runs work in an isolated copy of the repository creates git
worktrees under `.claude/worktrees/`, inside the checkout. `.gitignore` says
nothing about them, so they show up as untracked content: they clutter
`git status`, they are matched by repository-wide greps — which already sent a
search for a symbol down three copies of the same file — and a careless
`git add -A` would stage a second checkout of the project into itself.

The rest of `.claude/` is deliberately committed: agents, commands, hooks,
skills and templates are part of how the project is worked on. Only the
worktrees are transient.

## Symptom
`git status --short` lists `?? .claude/worktrees/` after any isolated run, and
`grep -rn <symbol> .` reports each hit once per live worktree.

## Scope
- **In scope**: ignore `.claude/worktrees/`.
- **Out of scope (explicit)**: everything else under `.claude/`, which stays
  committed; the tooling that creates the worktrees; removing worktrees that
  already exist locally, which is `git worktree remove`, not a repository
  change.

## References
- `.gitignore`

## Acceptance Criteria
- [ ] `git check-ignore -v .claude/worktrees/anything` reports a match.
- [ ] `git ls-files .claude` still lists the committed agents, commands, hooks,
      skills and templates.
- [ ] `git status --short` is clean while a worktree exists under
      `.claude/worktrees/`.

## Verification (manual)
1. Create `.claude/worktrees/probe/` → `git status --short` stays clean.
2. `git check-ignore -v .claude/worktrees/probe` → names the new rule.
