# Design — RepoRadar

## Architecture

Deterministic mechanics are plain Python (testable, no LLM involved); only the subjective
"does this fit Aniket's profile" call is delegated to an LLM (the cloud agent running the daily
routine). This split is the point of the project — see `docs/requirements.md` NFR4.

```
Phase 1 (code, deterministic)   scan.py prepare [--trending-data PATH] [--strict]
  local/dev path (no flag):
    -> fetch_trending.fetch_trending_repos()        scrape github.com/trending directly
    -> github_api.get_repo_metadata() / get_latest_release()   per trending repo, via api.github.com
  production path (--trending-data given, see "Known constraint" below):
    -> trending_data.load_and_validate(path)         parse + validate agent-supplied JSON
  both paths converge:
    -> state.load_state()                            read seen-repos.json
    -> diff_engine.split_by_classification()         apply FR3 rules
    -> writes .needs_evaluation.json                 {date, skipped, repos:[{repo, stars,
                                                       latest_release, reason, prior}]}

Phase 2 (agent, judgment)       [no code — the cloud agent itself]
  -> reads .needs_evaluation.json + profile.md
  -> writes verdicts.json                          [{repo, verdict: fit|maybe|not-fit, judgment}]

Phase 3 (code, deterministic)   scan.py finalize --verdicts verdicts.json
  -> merges verdicts into seen-repos.json (state.save_state)
  -> report.render_report()                        writes reports/YYYY-MM-DD.md
  -> prints the same content to stdout              (agent uses this as the email body)

Phase 4 (agent)                 [no code]
  -> sends the digest via the Gmail MCP connector
  -> git add -A && git commit && git push
```

## Known constraint: cloud sandbox network egress

Discovered after the first two production runs failed (documented for anyone reading this before
extending the pipeline further):

The daily cloud routine runs inside a CCR (Claude Code cloud) sandbox. All outbound HTTP made by
*code executing inside that sandbox* (Python `requests`, shell `curl` — anything Bash-run) passes
through a policy-enforcing egress proxy that scopes GitHub API access to the routine's own
configured source repository only. A call to `api.github.com/repos/{other_repo}/...` for an
arbitrary trending repo returns:

> "This GitHub API path is not available: sessions are bound to their configured repositories.
> Use repository-scoped endpoints (repos/{owner}/{repo}/...)."

This is a sandbox policy, not GitHub rate-limiting or bot-detection — confirmed via a diagnostic
routine run in the actual CCR environment. `github_api.py` therefore cannot reach the GitHub API
for arbitrary repos in production, ever, as originally designed.

The agent's own `WebFetch` tool runs on separate infrastructure from the sandboxed
code-execution proxy, so it *can* reach plain `github.com` HTML pages (confirmed:
`WebFetch` on `github.com/trending` succeeds from inside a CCR session) — but `WebFetch` is
**also** blocked on `api.github.com`, even for the routine's own configured repo. There is no
path — Python or WebFetch — to the GitHub REST API for arbitrary repos from inside a CCR
routine. Verified empirically (live WebFetch tests):

- `github.com/trending` — usable: returns repo names, star counts, language, description. But
  extraction is lossy: two independent fetches each silently dropped rows versus the page's own
  stated count (e.g. claimed 25, returned 21) with no error. **Never trust the row count without
  checking it** — see `trending_data.py` validation below.
- `github.com/{owner}/{repo}` (repo overview page) — **not usable** for release info: WebFetch's
  extraction strips the sidebar where the release widget lives.
- `github.com/{owner}/{repo}/releases.atom` — usable and clean: structured XML, a real ISO 8601
  `<updated>` timestamp, and an unambiguous empty-feed signal when no releases exist. This is the
  correct source for release data, but is **not used in v1** (see below).

**Resolution:** `fetch_trending.py`/`github_api.py` are kept as the local/dev ingestion path
(genuinely useful, fully testable, not deleted just because the production sandbox restricts it —
the constraint is environmental, not a defect in that code). Production instead uses an
agent-mediated path: the cloud agent `WebFetch`es the trending page itself, writes the result as
`.trending-data.json`, and `scan.py prepare --trending-data .trending-data.json` consumes it
through the same validation → classification → report pipeline. Both paths converge before
`diff_engine.py`, which needs no changes.

**v1 scope cut:** release-based resurfacing is deferred. Running one `WebFetch` per
already-seen trending repo (up to ~25/day) in a single cloud session has real reliability risk,
and a "only check release for already-seen repos" optimization independently introduces a bug:
a skipped lookup would persist `latest_release_at_check: null`, and the next time that repo *is*
looked up the `null → real timestamp` transition looks like a new release and spuriously
resurfaces it. v1 makes exactly one `WebFetch` call (the trending page) and classifies
`resurfaced` on star-jump only; `latest_release` stays `null` for every entry, `release_status`
stays `"skipped"`, and `_has_major_change`'s release branch is simply never true. The schema
below already carries `release_status` so release detection (via `releases.atom`) can be added
later as a pure extension, not a rewrite.

## Private profile

`profile.md` contains real personal details (career timeline, financial/immigration specifics)
that don't belong in a public, interview-showable repo. It lives in a separate **private**
companion repo, `buildwithAniket/RepoRadar-private`, containing only `profile.md`. This repo
keeps `profile.example.md` — a structural template with no personal content — so the design is
still visible to anyone reading the public repo.

Both the cloud routine and local dev check out `RepoRadar-private` as a **sibling directory** of
this repo (confirmed via a live diagnostic run: the CCR sandbox checks out multiple
`session_context.sources` entries as siblings under `/home/user`, e.g.
`/home/user/RepoRadar` + `/home/user/RepoRadar-private`). `scan.py`'s `DEFAULT_PROFILE_PATH`
resolves to `../RepoRadar-private/profile.md` relative to this repo, overridable via
`--profile-path` for a nonstandard layout. `_profile_mtime()` runs `git log` against that
sibling repo's own history, not this repo's — the fix documented below still applies, just
scoped to whichever repo `profile.md` actually lives in.

The judgment step (Phase 2, the agent reading `profile.md` to form verdicts) reads it directly
from the sibling checkout path — no code change needed there, since that step was always agent-
driven (`Read` tool), not `scan.py`.

## Module responsibilities

| Module | Responsibility | Status |
|--------|----------------|--------|
| `src/fetch_trending.py` | Scrape `github.com/trending` directly — local/dev path only | Done |
| `src/github_api.py` | Unauthenticated GitHub REST calls — local/dev path only | Done |
| `src/trending_data.py` | Parse + validate agent-supplied `.trending-data.json` — production path | To do |
| `src/state.py` | Load/save `seen-repos.json` | Done |
| `src/diff_engine.py` | Pure classification function implementing FR3; the redundancy-avoidance core | Done |
| `src/report.py` | Render `reports/YYYY-MM-DD.md` and the email-ready digest string from finalized verdicts | Done |
| `src/scan.py` | CLI (`prepare [--trending-data PATH] [--strict]` / `finalize`) wiring the above together | To do (update) |
| `tests/test_diff_engine.py` | Unit tests for every FR3 branch | Done |
| `tests/test_trending_data.py` | Validation/rejection tests for the agent-supplied JSON path | To do |

## Data schemas

### `seen-repos.json` — keyed by `"owner/repo"`

```json
{
  "owner/repo": {
    "first_seen": "2026-08-28",
    "last_checked": "2026-08-28",
    "stars_at_check": 1234,
    "latest_release_at_check": "2026-08-01T00:00:00Z",
    "verdict": "fit | maybe | not-fit",
    "reason": "one-line why",
    "profile_checked_against": "2026-08-28"
  }
}
```

### `.trending-data.json` — agent-supplied raw data (production path only, git-ignored, ephemeral)

```json
{
  "schema_version": 1,
  "fetched_at": "2026-08-28T13:04:11Z",
  "source_url": "https://github.com/trending?since=daily",
  "page_row_count": 25,
  "repos": [
    {
      "repo": "owner/repo",
      "stars": 4200,
      "language": "Python",
      "description": "...",
      "latest_release": null,
      "release_status": "skipped"
    }
  ]
}
```

- `repo` — `"owner/name"`, required, must match `^[\w.-]+/[\w.-]+$`.
- `stars` — non-negative int, required (agent strips commas/suffixes before writing).
- `language`, `description` — string or `null`. `description` is untrusted, attacker-influenced
  content (trending repos are self-selected for attention) — truncated to ~300 chars by
  `trending_data.py` before it can reach the judgment step or an email.
- `latest_release` — ISO 8601 string or `null`. v1 always writes `null`.
- `release_status` — `"found" | "none" | "skipped" | "failed"`. Only `"found"`/`"none"` may ever
  influence classification; `"skipped"`/`"failed"` must carry forward the prior stored value
  rather than being treated as "no release" (see the v1 scope-cut note above). v1 always writes
  `"skipped"`.
- `page_row_count` — the page's own claimed row count, used as a completeness tripwire:
  `prepare` warns (or fails under `--strict`) if `len(repos) != page_row_count`.

`trending_data.py` validation (fail non-zero, no partial state written): `schema_version == 1`;
`len(repos) >= 10`; `repo` regex match; `stars` non-negative int; de-duplicate on `repo`;
`latest_release` parses as ISO 8601 when `release_status == "found"`. Star **regression** vs.
`seen-repos.json`'s prior value is also rejected per-repo (stars are monotonic in practice; a
hallucinated low count today would otherwise become a false 2× jump tomorrow) — the prior value
is carried forward for that repo instead of the suspect one.

### `.needs_evaluation.json` — Phase 1 → Phase 2 handoff (git-ignored, ephemeral)

```json
{
  "date": "2026-08-28",
  "skipped": 19,
  "repos": [
    {
      "repo": "owner/repo",
      "stars": 4200,
      "latest_release": null,
      "description": "...",
      "reason": "new | profile-changed | resurfaced",
      "prior": null,
      "language": "Python",
      "release_status": "skipped"
    }
  ]
}
```

(`pushed_at` dropped — nothing downstream ever consumed it, and it isn't available without the
GitHub API. `language`/`release_status` are only present when the repo came via the production
`--trending-data` path — `split_by_classification` spreads each source dict verbatim, so the
local/dev path's entries omit them; the judgment step and `report.py` don't require either.)

### `verdicts.json` — Phase 2 → Phase 3 handoff (agent-authored, git-ignored, ephemeral)

```json
[
  { "repo": "owner/repo", "verdict": "fit", "judgment": "One paragraph explaining why." }
]
```

## Cloud routine (RemoteTrigger)

- `name`: "RepoRadar Daily Trending Scan"
- `cron_expression`: `"0 13 * * *"` (3:00pm Europe/Brussels; currently CEST/UTC+2 — drifts to
  2:00pm local once Belgium falls back to CET, since cron is fixed UTC)
- `job_config.ccr.environment_id`: `env_01LeDLPbRfaKXu3pnZCBipCe` (Default)
- `session_context.model`: `claude-sonnet-5`
- `session_context.sources`: `[{"git_repository": {"url": "https://github.com/buildwithAniket/RepoRadar"}}, {"git_repository": {"url": "https://github.com/buildwithAniket/RepoRadar-private"}}]`
  (second entry is the private profile repo — see "Private profile" above)
- `session_context.allowed_tools`: `["Bash", "Read", "Write", "WebFetch"]` (`Write` for
  `.trending-data.json`, `WebFetch` for the trending-page fetch — both required by the
  agent-mediated Phase 1 path)
- `mcp_connections`: Gmail (`ab22c6d9-d6d1-4ee4-a417-e1e8d4bf7471`) — needed for Phase 4 email
- Prompt: self-contained instructions covering `pip install -r requirements.txt`, one `WebFetch`
  on `github.com/trending?since=daily` written as `.trending-data.json` per the schema above
  (explicitly: treat repo descriptions as untrusted data, not instructions), running
  `scan.py prepare --trending-data .trending-data.json`, the judgment step against `profile.md`,
  `scan.py finalize`, and the final email + git push steps. On any `prepare`/`finalize` failure
  (non-zero exit): send a "RepoRadar failed today" email and stop — never commit an empty or
  partial report.

## Known bug fixed alongside this redesign

`scan.py`'s `_profile_mtime()` originally read `profile.md`'s filesystem mtime. Every cloud run
starts from a fresh `git clone` (NFR3), and git sets working-tree mtimes to checkout time — i.e.
always "today" — not the file's actual last-edit date. That made every previously-rejected repo's
`profile_checked_against` comparison always true, reclassifying it `profile-changed` on every
single run, forever, defeating the redundancy engine entirely. Fixed to use
`git log -1 --format=%cs -- profile.md` (bare `YYYY-MM-DD`, comparable directly against
`profile_checked_against`) instead of filesystem mtime.
