# Standard prompt: implement a GitHub issue

Paste the block below into a fresh session, replacing `<N>` with the issue number. It wraps the `/implement` skill with the repo-specific gates that made issues #3–#6 land cleanly.

```
/implement GitHub issue #<N> in buildwithAniket/RepoRadar.

Setup
- Run `gh issue view <N> --comments`. Also read its parent issue (the "## Parent" line) for the overall goal.
- Check "## Blocked by". If any blocker is still open, stop and tell me; do not start.
- Read CONTEXT.md and the ADRs in docs/adr/ that touch the area. Use the CONTEXT.md vocabulary (Disc, Edition, Digest, Verdict, Docket, Tracklist, Filmstrip) in names, comments, tests and commit messages. If your work contradicts an ADR, say so explicitly instead of overriding it.
- Stay on the current branch (refactor/ui-modules). Do not create branches, push, or open PRs.

Scope
- Do exactly what the issue's "What to build" and "Acceptance criteria" say, nothing more. Move code unchanged where the issue says move; no drive-by behaviour changes, renames or cleanups. If the issue is ambiguous or you hit something it doesn't cover, ask me.
- UI rules (ADR 0001): native ES modules, no build step, no bundler, no new runtime dependencies. Files are served as-is by GitHub Pages. Extracted modules import explicitly and do not reach into app state unless the issue says so.
- Use /tdd for logic that has a pure seam (node:test in ui/tests/*.test.mjs). The seams named in this prompt are pre-agreed; do not stop to confirm them. For pure moves of DOM/WebGL code the Playwright baseline in e2e/ is the test; do not invent mocks for it.

Verification
- Python changes: `ruff check .`, `black --check .`, single pytest files while iterating.
- UI unit: `node --test 'ui/tests/*.test.mjs'`
- UI e2e: serve with `python3 -m http.server 8000 --directory ui`, then `cd e2e && npx playwright test`. Baseline must stay green and unmodified unless the issue says otherwise.
- Full suite once at the end: pytest + node tests + Playwright. Report real output; if anything fails or is skipped, say so.

Finish
- Run /code-review on the work. Fix real findings; list anything you deliberately skipped.
- Tick the acceptance-criteria checkboxes that are verifiably met.
- Commit to the current branch in the repo's style: `refactor(ui): <summary> (#<N>)` (or `test(e2e)` / `docs` as fits), a body listing renames or notable decisions, then the Co-Authored-By trailer. One commit per issue.
- Comment on the issue with what changed and the verification results.
- If everything is OK (all acceptance criteria met, full suite green, review findings handled, committed), close the issue with `gh issue close <N> --repo buildwithAniket/RepoRadar`. If anything failed, was skipped, or is an open question, leave it open and say why.
- Final message: what was done, test results, review findings handled, open questions. Keep it short.
```

## Notes

- Open issues are chained by "Blocked by" (#7 → #12 → #13 …). Run them in dependency order, one session per issue.
- Pass `--model`/effort as you like; the prompt does not depend on it.
