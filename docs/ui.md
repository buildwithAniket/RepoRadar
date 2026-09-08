# RepoRadar dashboard — design & build spec

Status: v2 rebuild, 2026-09-09. Supersedes the v1 "radar scope" UI.

## Why v2

v1 ran three permanent per-frame workloads on an idle page: a 60 fps canvas radar using
`shadowBlur` on every blip, a Lenis smooth-scroll `requestAnimationFrame` loop, and a full-viewport
`mix-blend-mode` grain overlay plus a `filter: blur(20px)` element animating `transform`. That is
what made the laptop hot and the page sluggish. Visually it was a dark, monospace, terminal-styled
"scope" that read as a machine talking to itself.

v2 is a **calm daily digest**: a page you read for one minute each morning. Its job is to answer
"what did RepoRadar find today, is anything worth a look, and what has it seen before?"

## Goals

1. Idle CPU ≈ 0. No `requestAnimationFrame`, no canvas, no infinite CSS animations, no
   `backdrop-filter`, no `filter: blur`, no `mix-blend-mode`, no fixed overlays.
2. Feels human: warm paper background, one serif for headings, plain-English summaries, real repo
   descriptions, generous whitespace. Light theme first, dark theme via `prefers-color-scheme`.
3. Every element earns its place. If it does not help answer the question above, it is gone.
4. Dependencies: `react`, `react-dom` only. Fonts from Google Fonts with system fallbacks.
5. Accessible: semantic headings, keyboard nav, visible focus, AA contrast, reduced-motion safe.

## Non-goals

- No LLM judgment text. `profile.md` is private; `scan.py` deliberately writes only canned
  sentences into reports. The UI shows GitHub's public description instead.
- No charts library, no command palette, no typing animations, no counters.

## Data

The page reads committed files via Vite: `seen-repos.json` and `reports/*.md` (see
`ui/src/data/load.ts`). `parse.ts` is pure and unit-tested. Two public fields are new in v2 and
optional (older entries lack them; the UI must render fine without them):

```ts
export interface SeenEntry {
  first_seen: string                 // YYYY-MM-DD
  last_checked: string               // YYYY-MM-DD
  stars_at_check: number
  latest_release_at_check: string | null
  verdict: Verdict                   // 'fit' | 'maybe' | 'not-fit'
  profile_checked_against: string    // YYYY-MM-DD
  description?: string | null        // GitHub repo description, ≤300 chars (public data)
  language?: string | null           // GitHub primary language (public data)
}
```

`buildModel` joins each `ScanEntry` and `LedgerRow` to its `SeenEntry` so both carry
`description: string | null` and `language: string | null`. `ScanEntry` also carries `reason`.

Verdict → user-facing label: `fit` → **Worth a look**, `maybe` → **Maybe**, `not-fit` → **Passed**.
Reason → label: `new` → "New", `resurfaced` → "Back with a big change",
`profile-changed` → "Re-judged after profile change".

## Visual language

Tokens (all in `ui/src/styles.css` on `:root`, dark overrides under
`@media (prefers-color-scheme: dark)`):

| token | light | dark | use |
|---|---|---|---|
| `--paper` | `#f7f4ee` | `#141311` | page background |
| `--paper-2` | `#efeae1` | `#1c1a17` | table header, subtle fills |
| `--ink` | `#1c1a17` | `#ece7dd` | primary text |
| `--ink-2` | `#4a463f` | `#b8b1a4` | secondary text |
| `--muted` | `#87806f` | `#7f786c` | labels, meta |
| `--line` | `#e2dccf` | `#2a2723` | hairlines |
| `--fit` | `#1f7a4d` | `#5fbf8a` | Worth a look |
| `--maybe` | `#a8681a` | `#d9a24a` | Maybe |
| `--pass` | `#87806f` | `#7f786c` | Passed (neutral, de-emphasised) |
| `--focus` | `#1f7a4d` | `#5fbf8a` | focus ring |

Type: headings and the big date in **Newsreader** (serif, `opsz` 6..72, weights 400–600);
everything else in **Inter** with `font-variant-numeric: tabular-nums` for numbers. Body 15px /
1.55. Content width `max-width: 880px`, side gutter `clamp(16px, 4vw, 40px)`.

Motion: only `transition` on `color`, `background-color`, `border-color`, `opacity`, ≤ 180 ms.
One optional fade-in on first paint (`opacity` 0→1, 240 ms). All disabled under
`prefers-reduced-motion`.

## Information architecture (top to bottom)

1. **Header** — "RepoRadar" wordmark (text, serif), one quiet line right:
   `83 repos on file · 9 scans · since 30 Aug`.
2. **Day header** — big serif date ("Tuesday, 8 September"), prev/next buttons (`←` `→` keys also
   work), then a plain-English sentence built from the scan:
   "Looked at 16 trending repos. Judged 6 that were new or changed, skipped 10 already on file.
   2 worth a look." Empty day: "Nothing new or changed. All 12 trending repos were already on file."
3. **Day strip** — every scan date as a small button in a horizontally scrollable row (newest on
   the right), each showing a short date and a tiny inline count of fit/maybe. Selected is
   underlined in `--ink`. Static; no bars, no animation.
4. **Digest** for the selected day, grouped by verdict in this order: Worth a look, Maybe, Passed.
   Passed is collapsed by default behind a `<details>` "Passed on N repos". Each group has an h2
   and a list of **RepoRow**s.
5. **RepoRow** — the whole row is a link to `https://github.com/{repo}` (opens new tab).
   Layout: line 1 `owner/` muted + `name` strong; line 2 description (or "No description" muted);
   line 3 meta in `--muted`: language, `★ 28,363`, star delta when `priorStars` exists and differs
   (`↑ from 12,000`), reason chip if not `new`. Verdict is shown by a 3px left border in the
   verdict colour, no badge text repeated per row.
6. **Ledger** — "Everything on file" h2, controls: search input (repo or description), segmented
   verdict filter (All / Worth a look / Maybe / Passed with counts, `aria-pressed`), sortable table:
   Repo (name + one-line description), Language, Stars, Verdict, First seen, Last checked, and a
   quiet "scan →" button that jumps to that repo's last scan (selects the day, scrolls to the
   digest, briefly highlights the row via `.is-flash` background transition). Default sort: last
   checked desc. `/` focuses the search when no input is focused.
7. **Footer** — one line: how data is read, and the keyboard hints.

## Component contract (`ui/src/`)

```
App.tsx                 state: selected scan index, flash repo, filters live in Ledger
components/Header.tsx   props: totals
components/DayHeader.tsx props: scan, index, count, onPrev, onNext
components/DayStrip.tsx props: scans, selected, onSelect
components/Digest.tsx   props: scan, flash   (renders RepoRow groups)
components/RepoRow.tsx  props: entry: ScanEntry, flash: boolean
components/Ledger.tsx   props: ledger, totals, today, onJump(repo)
components/Footer.tsx   no props
lib/format.ts           fmt, shortDate, longDate, weekday, isoUTC, daysBetween, relDays,
                        splitRepo, prefersReducedMotion, VERDICT_LABEL, REASON_LABEL
data/parse.ts, data/load.ts  (as above)
```

Delete from v1: `Radar.tsx`, `Counter.tsx`, `TransmissionLog.tsx`, `CommandPalette.tsx`,
`Hero.tsx`, `TopBar.tsx`, `Timeline.tsx`, `ScanBoard.tsx`; remove `lenis` and `motion`.

## Acceptance

- `cd ui && npm run build` passes (tsc + vite), `npm test` passes.
- `grep -rn "requestAnimationFrame\|<canvas\|backdrop-filter\|filter: blur\|mix-blend-mode\|infinite" ui/src` returns nothing.
- Chrome performance trace over 5 idle seconds shows no scripting and no continuous rendering.
- Lighthouse performance ≥ 95, accessibility ≥ 95 on the dev build.
- Renders correctly with the real repo data including entries missing description/language.
