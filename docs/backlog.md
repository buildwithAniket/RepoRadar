# Backlog — RepoRadar

Agile-style epics/stories. See `docs/requirements.md` for the FR/NFR each story satisfies and
`docs/design.md` for schemas and module contracts.

## Epic 1 — Core deterministic engine ✅ Done

- **1.1** Scrape trending list — `src/fetch_trending.py` (FR1)
- **1.2** GitHub metadata + release lookups — `src/github_api.py` (FR2)
- **1.3** State load/save — `src/state.py` (FR5)
- **1.4** Redundancy classification (pure function) — `src/diff_engine.py` (FR3, NFR1)

## Epic 2 — Reporting & CLI orchestration 🔲 To do

- **2.1** `src/report.py` — render `reports/YYYY-MM-DD.md` and an email-ready digest string from
  a list of evaluated repos + skip count (FR6, FR7). Section by classification reason (new /
  resurfaced / profile-changed), each entry shows repo link, star count, verdict badge, and the
  judgment paragraph. Footer states the skip count.
- **2.2** `src/scan.py` — CLI with two subcommands per `docs/design.md`'s Phase 1/3:
  - `prepare`: runs FR1/FR2, loads state, calls `diff_engine.split_by_classification`, writes
    `.needs_evaluation.json`.
  - `finalize --verdicts verdicts.json`: merges verdicts into `seen-repos.json`, calls
    `report.render_report`, writes the dated report file, prints the digest to stdout.

**Acceptance:** running `prepare` then a hand-written `verdicts.json` then `finalize` produces a
valid `reports/<date>.md` and an updated `seen-repos.json` matching the schema in `design.md`.

## Epic 3 — Test coverage & project hygiene 🔲 To do

- **3.1** `tests/test_diff_engine.py` — cover every FR3 branch: new (no prior), skip (unchanged),
  resurfaced via star jump, resurfaced via new release, profile-changed (prior not-fit/maybe +
  profile edited since), and the negative case (profile edited but prior verdict was `fit` →
  still skip). Include a `split_by_classification` test asserting the skip count.
- **3.2** `README.md`, `reports/README.md` placeholder, `.gitignore` (`__pycache__/`, `*.pyc`,
  `.pytest_cache/`, `.needs_evaluation.json`, `verdicts.json`).

**Acceptance:** `pytest` green; a stranger reading `README.md` understands what the project does
and how to run it locally.

## Epic 4 — Deployment ✅ Done (orchestrator — not delegated; real external/irreversible actions)

- **4.1** Run `pytest` locally to confirm Epics 2/3 land correctly.
- **4.2** Initial commit; `gh repo create buildwithAniket/RepoRadar --public --source=. --push`.
- **4.3** Create the RemoteTrigger routine per `docs/design.md`'s Cloud routine section, with the
  full four-phase prompt and Gmail connector attached.
- **4.4** Fire the routine once manually, verify via `RemoteTrigger list_runs`/`get_run_log`,
  confirm the report/commit/email all landed, confirm `next_run_at` is correct.

Both manual test fires failed at Phase 1 — `github_api.py` (and its Search-API fallback) could not
reach `api.github.com` for arbitrary repos from inside the CCR sandbox. Diagnosed as a sandbox
network-policy restriction, not a GitHub-side block (see NFR5, `docs/design.md`'s "Known
constraint" section). Both failed runs correctly emailed a failure notice and left the repo
clean rather than committing broken state, which is the fail-safe behavior Epic 5 formalizes.
Epic 5 below is the fix.

## Epic 5 — Production data-ingestion redesign ✅ Done

Fixes NFR5 (sandbox network constraint) and an independently-discovered bug in NFR3's
`profile.md` change-detection. See `docs/design.md`'s "Known constraint" and "Known bug fixed
alongside this redesign" sections for the full reasoning (reviewed against a second-opinion pass
before implementation).

- **5.1** `src/trending_data.py` — parse + validate agent-supplied `.trending-data.json`: schema
  version, repo-name regex, non-negative int stars, dedupe, row-count tripwire, star-regression
  guard against `seen-repos.json` (NFR5).
- **5.2** `src/scan.py` — add `prepare [--trending-data PATH] [--strict]`: when the flag is given,
  route through `trending_data.py` instead of `fetch_trending.py`/`github_api.py`; fix
  `_profile_mtime()` to read `git log -1 --format=%cs -- profile.md` instead of filesystem mtime
  (NFR3 bug fix); drop the unused `pushed_at` field from `.needs_evaluation.json`; truncate
  `description` to ~300 chars before it reaches the judgment step (untrusted content).
  `prepare`/`finalize` exit non-zero on any validation failure instead of writing a partial
  report.
- **5.3** `tests/test_trending_data.py` — rejection tests for every validation rule in 5.1, plus a
  regression test proving `_profile_mtime()` no longer flips on a bare checkout.
- **5.4** Update the RemoteTrigger routine: `allowed_tools` adds `Write`/`WebFetch`; prompt does
  one `WebFetch` on `github.com/trending?since=daily` → `.trending-data.json` →
  `scan.py prepare --trending-data ...`, treats repo descriptions as untrusted data, and sends a
  failure email (no commit) on non-zero exit from either subcommand. (orchestrator — not
  delegated)
- **5.5** Fire the routine once manually; confirm via `get_run_log` that Phase 1 succeeds, a
  report is generated, `seen-repos.json` updates correctly (and does **not** reclassify existing
  entries as `profile-changed`), the email arrives, and the commit lands. (orchestrator — not
  delegated)

## Epic 6 — Private profile (NFR6) ✅ Done (orchestrator — not delegated; real/irreversible actions)

Discovered after Epic 5 shipped: `profile.md` had been committed to the public repo with
personal details that didn't belong there, since the very first commit. Fixed by splitting the
profile into a separate private repo, verified via a live diagnostic before committing to the
design (see `docs/design.md`'s "Private profile" section).

- **6.1** Diagnostic: fire a one-off routine with two `session_context.sources` entries to
  confirm the CCR sandbox can check out a second (private) repo, and learn where it lands on
  disk. Confirmed: sibling directories under `/home/user` — no assumptions made.
- **6.2** Create `buildwithAniket/RepoRadar-private` (private repo, `profile.md` only). Clone it
  locally as `~/RepoRadar-private`, sibling to `~/RepoRadar`, mirroring production's layout.
- **6.3** `src/scan.py`: `_profile_mtime()` now takes an explicit `profile_path` argument instead
  of hardcoding this repo's root; `cmd_prepare` resolves `DEFAULT_PROFILE_PATH`
  (`../RepoRadar-private/profile.md`) or `--profile-path`, and fails loudly (not silently) if
  it's missing.
- **6.4** Remove `profile.md` from this repo; add `profile.example.md` (structural template, no
  personal content) so the design stays visible publicly.
- **6.5** Rewrite this repo's git history to scrub `profile.md`'s real content from all past
  commits, force-push. Destructive, done only after explicit user confirmation.
- **6.6** Update the RemoteTrigger routine: add `RepoRadar-private` as a second
  `session_context.sources` entry; update the prompt to read `profile.md` from the sibling
  checkout path instead of this repo's root.
- **6.7** Fire the routine once manually; confirm the judgment step reads the real profile from
  the private repo and nothing personal appears in this repo's working tree or new commits.

Also discovered mid-fix: `docs/requirements.md` and `docs/backlog.md` themselves (project
background prose, not `profile.md`) restated the same personal specifics, and the digest report
(`reports/2026-08-27.md`) referenced `profile.md`'s section names in its judgment text. Both
fixed — docs reframed to purely technical language, report language genericized to describe
topical fit without naming or quoting the private profile's structure. Full history rewritten a
second time (`git filter-repo --replace-text` + `--replace-message` across all commits and
messages) and force-pushed; verified clean via a fresh clone directly from GitHub, not a local
cache. Confirmed working end-to-end via a live fire on 2026-08-28: the redundancy engine
correctly skipped all 19 previously-seen repos (first real proof it works, not just that new
repos get evaluated), and the run gracefully handled `origin/main` having been force-pushed
after its own checkout.
