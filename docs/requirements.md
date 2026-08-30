# Requirements — RepoRadar

## Goal

A daily system that scans GitHub's trending repos, judges each against a personal profile, and
delivers a digest — without repeating a repo it already evaluated unless something material
changed. Built as a real, interview-showable codebase, not a black-box prompt.

## User & context

A personal interest-curation tool. Full profile criteria live in `profile.md` in a private
companion repo (see NFR6), not this one, and are expected to change over time;
`profile.example.md` here shows the structure without the personal content.

## Functional requirements

| ID | Requirement |
|----|-------------|
| FR1 | Obtain today's trending repo list with star counts. Two ingestion paths: local/dev scrapes `github.com/trending` directly; production (cloud routine) is agent-mediated — see NFR5. |
| FR2 | For each trending repo, obtain star count (both paths) and latest-release info (local/dev path only in v1 — see NFR5's scope cut). |
| FR3 | Classify each trending repo as `new`, `profile-changed`, `resurfaced`, or `skip` against `seen-repos.json`, using these rules: <br>• not in the log → `new` <br>• in the log, prior verdict was `not-fit`/`maybe`, and `profile.md` was modified (per its git history, not filesystem mtime — see NFR3) after the entry's `profile_checked_against` → `profile-changed` <br>• in the log, and (current stars ≥ 2× `stars_at_check`) or (a newer release than `latest_release_at_check`, when release data is available) → `resurfaced` <br>• otherwise → `skip` |
| FR4 | Only `new`/`profile-changed`/`resurfaced` repos get a judgment call against `profile.md` (fit / maybe / not-fit + one-paragraph reason). `skip`ped repos are only tallied, not detailed. |
| FR5 | Persist every evaluated repo's outcome back into `seen-repos.json` (schema in `docs/design.md`). |
| FR6 | Render a dated markdown report (`reports/YYYY-MM-DD.md`) summarizing new/resurfaced/profile-changed repos plus the skip count. |
| FR7 | Deliver the **full** daily digest (not just matches) two ways: committed to the repo, and emailed via Gmail. |
| FR8 | Run automatically once a day (cloud routine), with no manual trigger required. |

## Non-functional requirements

| ID | Requirement |
|----|-------------|
| NFR1 | The redundancy-classification logic (FR3) must be pure, dependency-free, and unit-tested — it's the core "don't repeat yourself" guarantee and the most interview-relevant piece of code. |
| NFR2 | Local/dev ingestion path stays within GitHub's unauthenticated REST rate limit (60 req/hr) — ≤~25 trending repos/day × 2 calls each. Not applicable to the production path (NFR5), which makes no direct API calls. |
| NFR3 | Each cloud run starts from a fresh checkout with no memory of prior runs — all state needed must live in the repo (`seen-repos.json`, `profile.md`), not in agent memory. Consequently, `profile.md`'s "last changed" date must be read from git history (`git log -1 --format=%cs`), never filesystem mtime — a fresh checkout resets mtimes to today, which silently defeats FR3's `profile-changed` rule. |
| NFR4 | The repo must be genuinely presentable — real code, tests, and docs, not just a prompt. |
| NFR5 | The production cloud sandbox (CCR) restricts outbound network access: code executed via Bash (Python `requests`, `curl`) can only reach the routine's own configured source repo's GitHub API endpoints, and the agent's `WebFetch` tool can reach plain `github.com` pages but not `api.github.com` at all. Production Phase 1 is therefore agent-mediated (`WebFetch` on `github.com/trending`, written as `.trending-data.json` for `scan.py prepare --trending-data` to validate and consume) rather than direct HTTP from Python. v1 scope cut: only one `WebFetch` call is made per run (the trending page); release-based resurfacing is deferred since per-repo lookups at that volume are unreliable in a single cloud session — see `docs/design.md`. |
| NFR6 | `profile.md` must never be committed to this (public) repo — it holds real personal details (career timeline, financial/immigration specifics). It lives in a private companion repo (`buildwithAniket/RepoRadar-private`), checked out as a sibling directory by both the cloud routine and local dev; this repo only ever contains `profile.example.md`, a content-free structural template. |

## Acceptance criteria

- `pytest` passes for the diff-engine rules in FR3 (new / skip / star-jump / new-release / profile-changed / profile-change-ignored-when-prior-fit) and for the `.trending-data.json` validation rules in NFR5 (rejects malformed schema, bad repo names, negative stars, duplicate repos, star regression).
- A manual end-to-end run produces a report file, updates `seen-repos.json`, and sends an email.
- Re-running the pipeline the next day with no `profile.md` change and no repo-metadata change reclassifies every previously-seen repo as `skip`, not `profile-changed` (regression check for the NFR3 mtime bug).
- The routine fires daily at 3:00pm Europe/Brussels unattended and pushes its result to `main`.
- No commit in this repo's git history (past or future) contains real `profile.md` content —
  only `profile.example.md` (NFR6).
