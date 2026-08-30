# RepoRadar

RepoRadar scans GitHub's daily trending page, checks each repo against a personal interest
profile, and produces a digest of what's actually worth a look — without re-surfacing repos it
already evaluated unless something material changed (a big star jump, a new release, or an edit
to the profile that could flip an old verdict).

## Why

Scrolling `github.com/trending` every day and re-reading repos you already dismissed yesterday is
tedious and doesn't scale. The interesting part of this project isn't "ask an LLM if a repo is
cool" — it's the deterministic scraping + diffing pipeline that decides *which* repos are even
worth asking an LLM about, so the judgment step (LLM-as-judge against `profile.md`) only runs on
what's new or changed. Classification is pure, dependency-free, and unit-tested; the subjective
call is the only part left to the model.

## Layout

| Path | What it is |
|------|------------|
| `profile.example.md` | Template showing `profile.md`'s structure. The real `profile.md` lives in a private companion repo (`RepoRadar-private`, checked out as a sibling directory) — it holds personal details that don't belong in a public repo; see `docs/design.md`'s "Private profile" section. |
| `seen-repos.json` | Persistent log of every repo evaluated so far, keyed by `owner/repo`, with verdict and last-check metadata. |
| `src/` | The pipeline: trending scraper, GitHub API client, state I/O, classification engine, report renderer, and the `scan.py` CLI. |
| `tests/` | Unit tests, primarily for `src/diff_engine.py`'s classification rules. |
| `reports/` | Dated digests (`YYYY-MM-DD.md`), one per run. |

## A constraint that shaped the design

The production cloud routine runs inside a sandboxed environment whose network egress is
policy-restricted: code executed there (Python `requests`, `curl`) can't reach `api.github.com`
for arbitrary repos, and even the agent's own `WebFetch` tool is blocked on `api.github.com`
entirely — only plain `github.com` HTML pages are reachable, and only via `WebFetch`, not from
Python. Rather than abandon the tested scraping/API code, `scan.py prepare` has two ingestion
paths that converge on the same classification/state/report pipeline: a local/dev path
(`fetch_trending.py` + `github_api.py`, direct HTTP) and a production path (`--trending-data`,
consuming JSON the cloud agent gathers via `WebFetch` and hands to `trending_data.py` for
validation). See `docs/design.md`'s "Known constraint" section for the full story, including how
that redesign also surfaced and fixed a separate bug in the profile-change-detection logic.

## Running it locally

```bash
pip install -r requirements.txt

# profile.md isn't in this repo (see Layout above) - set up the sibling private repo once:
# git clone https://github.com/<you>/RepoRadar-private.git ../RepoRadar-private
# (or copy profile.example.md there and fill it in)

# Phase 1 — scrape + fetch metadata + classify against seen-repos.json
python src/scan.py prepare
```

`prepare` writes `.needs_evaluation.json` listing every repo that needs a fresh judgment call
(new / resurfaced / profile-changed), plus a skip count. Judge those repos against `profile.md`
yourself (or hand `.needs_evaluation.json` and `profile.md` to an LLM) and write the verdicts to
`verdicts.json`:

```json
[
  { "repo": "owner/name", "verdict": "fit", "judgment": "Why this is relevant, one paragraph." },
  { "repo": "owner/other", "verdict": "not-fit", "judgment": "Why this isn't relevant." }
]
```

`verdict` is one of `fit`, `maybe`, `not-fit`. Then finalize:

```bash
# Phase 3 — merge verdicts into seen-repos.json, render the dated report
python src/scan.py finalize --verdicts verdicts.json
```

This writes `reports/YYYY-MM-DD.md`, updates `seen-repos.json`, and prints the digest to stdout.

---

In production this whole cycle (including the judgment step) runs unattended once a day via a
scheduled Claude Code cloud routine, which then emails the digest and pushes the resulting commit.
