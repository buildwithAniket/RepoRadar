# Product

<!-- impeccable:product-schema 1 -->

## Platform
web

## Users
Aniket (the developer) uses RepoRadar to discover relevant GitHub repositories for AI agents, developer tooling, workflow automation, and financial systems; also showcases the project as a demonstration of production-grade engineering skills during his job hunt.

## Product Purpose
Automates the discovery and evaluation of trending GitHub repositories through a deterministic pipeline that combines rule-based diffing with LLM-as-judge, delivering curated daily digests via email and git-committed reports, enabling efficient technology scouting and personal skill demonstration.

## Positioning
Unlike basic trending scrapers, RepoRadar V3 uniquely combines deterministic classification (star jumps ≥2x, new releases, profile changes) with LLM-as-judge for nuanced verdicts (fit/maybe/not-fit), ensuring high-signal output while preserving full transparency and reproducibility.

## Operating Context
Runs as a daily cron job (13:00 UTC) on a personal workstation or server; processes GitHub Trending data, applies diff engine to filter repos needing evaluation, invokes LLM API for judgments, renders Markdown digests, sends via SMTP, and auto-commits state changes to git; used during job search and as a portfolio piece.

## Capabilities and Constraints
- Deterministic scraping & diffing engine (star jumps ≥2x, new releases, profile changes)
- Monolithic JSON state management (`seen-repos.json`)
- Automated LLM-as-judge step (Gemini/OpenAI) with exponential backoff and fallback
- Gmail SMTP daily digest delivery
- Automated git commit & push sync
- Configurable state pruning (max age 90 days)
- Fail-on-empty trending scrape (configurable)
- Output: Markdown reports in `reports/YYYY-MM-DD.md` and email digest
- Requires Python 3.9+, requests, beautifulsoup4, pyyaml (dev: pytest, ruff, black)
- Preserves full pipeline transparency via logged steps and git history

## Brand Commitments
- Name: RepoRadar V3
- Voice: Technical, precise, production-grade (as reflected in documentation and code)
- Assets: None explicitly bound; project showcases original engineering over copying
- Personality: Reliable, efficient, insightful — built for the discerning developer
- Identity constraints: Must preserve deterministic mechanics strictly separate from LLM judgment; no silent fallbacks — fail loud

## Evidence on Hand
- Functional pipeline: daily cron job produces verified digests (see `reports/` directory)
- Architecture documentation: `reporadarv3-architecture.html`
- UI exploration: `UI_PLAN.md` outlines a web dashboard vision
- Profile alignment: `profile.md` defines user interests matching pipeline focus
- Test suite: `tests/` directory with pytest configuration
- Version history: git commits show iterative improvements

## Product Principles
1. Deterministic first: mechanics (scraping, diffing, state) are strictly separated from LLM judgment to enable verification and rate-limit safety.
2. Original over copying: prioritize novel engineering solutions and transparent design over imitation.
3. Lively interfaces: when extending to UI, embrace motion, tactile feedback, and distinctive aesthetics that reward engagement.
4. Small controlled chunks: build in isolated, verifiable steps to optimize for free-tier LLM limits and session efficiency.
5. Fail loud: errors surface immediately with actionable context; no silent fallbacks.

## Accessibility & Inclusion
- Currently a CLI/email product; accessibility not applicable beyond clear communication in digests.
- Future web UI must meet WCAG 2.1 AA standards, including color contrast, keyboard navigation, and screen-reader support.
- No known exclusionary barriers in current output (Markdown is inherently accessible).