# RDFY-034 — Ignore agent worktrees inside the checkout

## Outcome
Done. `.claude/worktrees/` is ignored. Isolated tooling runs create git
worktrees there, inside the checkout, and nothing excluded them: they cluttered
`git status`, they were matched by repository-wide searches — a symbol search
during this work came back with three copies of the same file — and
`git add -A` would have staged a second checkout of the project into itself.

Everything else under `.claude/` stays committed. Agents, commands, hooks,
skills and templates are part of how the project is worked on; only the
worktrees are transient.

## Files changed
- `.gitignore`

## Verification
- `git check-ignore -v .claude/worktrees/probe/file.ts` names the new rule.
- `git status --short` stays clean with a worktree present.
- `git ls-files .claude` still lists the eleven committed files.
