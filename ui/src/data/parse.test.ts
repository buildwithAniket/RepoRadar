import { describe, expect, it } from 'vitest'
import { buildModel, parseReport } from './parse'

const SAMPLE = `# RepoRadar — 2026-01-02

## New today

### [alpha/one](https://github.com/alpha/one) — ⭐ 1200 — ✅ Fit

This repository was classified as a strong match.

### [beta/two](https://github.com/beta/two) — ⭐ 40 — ❌ Not fit

x

## Resurfaced (major change)

### [gamma/three](https://github.com/gamma/three) — ⭐ 9000 — 🤔 Maybe

y

---

_7 repos skipped (no material change since last check)._
`

describe('parseReport', () => {
  it('reads sections, entries and the skip count', () => {
    const r = parseReport('2026-01-02', SAMPLE)
    expect(r.skipped).toBe(7)
    expect(r.sections.map((s) => s.key)).toEqual(['new', 'resurfaced'])
    expect(r.sections[0].entries).toEqual([
      { repo: 'alpha/one', stars: 1200, verdict: 'fit' },
      { repo: 'beta/two', stars: 40, verdict: 'not-fit' },
    ])
    expect(r.sections[1].entries[0]).toEqual({ repo: 'gamma/three', stars: 9000, verdict: 'maybe' })
  })

  it('handles an empty day', () => {
    const r = parseReport(
      '2026-01-03',
      '# RepoRadar — 2026-01-03\n\nNo new, resurfaced, or profile-changed repos today.\n\n---\n\n_12 repos skipped (no material change since last check)._\n',
    )
    expect(r.sections).toEqual([])
    expect(r.skipped).toBe(12)
  })
})

describe('buildModel', () => {
  it('links priors from earlier scans only and totals the ledger', () => {
    const day1 = parseReport('2026-01-01', '## New today\n\n### [x/y](https://github.com/x/y) — ⭐ 100 — ❌ Not fit\n\n_0 repos skipped_\n')
    const day2 = parseReport('2026-01-02', '## Resurfaced (major change)\n\n### [x/y](https://github.com/x/y) — ⭐ 250 — ✅ Fit\n\n_3 repos skipped_\n')
    const model = buildModel(
      {
        'x/y': {
          first_seen: '2026-01-01',
          last_checked: '2026-01-02',
          stars_at_check: 250,
          latest_release_at_check: null,
          verdict: 'fit',
          profile_checked_against: '2026-01-02',
        },
      },
      [day1, day2],
    )
    expect(model.scans[0].sections[0].entries[0].priorStars).toBeNull()
    const re = model.scans[1].sections[0].entries[0]
    expect(re.priorStars).toBe(100)
    expect(re.priorVerdict).toBe('not-fit')
    expect(model.scans[1].trending).toBe(4)
    expect(model.ledger[0]).toMatchObject({ appearances: 2, lastReason: 'resurfaced', verdict: 'fit' })
    expect(model.totals).toMatchObject({ repos: 1, fit: 1, scans: 2, evaluated: 2, skipped: 3 })
  })

  it('populates reason, description, and language on scan entries', () => {
    const report = parseReport('2026-01-01', '## New today\n\n### [a/b](https://github.com/a/b) — ⭐ 500 — ✅ Fit\n\n_0 repos skipped_\n')
    const model = buildModel(
      {
        'a/b': {
          first_seen: '2026-01-01',
          last_checked: '2026-01-01',
          stars_at_check: 500,
          latest_release_at_check: null,
          verdict: 'fit',
          profile_checked_against: '2026-01-01',
          description: 'A great library',
          language: 'TypeScript',
        },
      },
      [report],
    )
    const entry = model.scans[0].sections[0].entries[0]
    expect(entry.reason).toBe('new')
    expect(entry.description).toBe('A great library')
    expect(entry.language).toBe('TypeScript')
  })

  it('sets description and language to null when seen entry lacks them', () => {
    const report = parseReport('2026-01-01', '## New today\n\n### [c/d](https://github.com/c/d) — ⭐ 100 — ❌ Not fit\n\n_0 repos skipped_\n')
    const model = buildModel(
      {
        'c/d': {
          first_seen: '2026-01-01',
          last_checked: '2026-01-01',
          stars_at_check: 100,
          latest_release_at_check: null,
          verdict: 'not-fit',
          profile_checked_against: '2026-01-01',
        },
      },
      [report],
    )
    const entry = model.scans[0].sections[0].entries[0]
    expect(entry.description).toBeNull()
    expect(entry.language).toBeNull()
  })

  it('sets description and language to null when repo is not in seen entries', () => {
    const report = parseReport('2026-01-01', '## New today\n\n### [e/f](https://github.com/e/f) — ⭐ 200 — 🤔 Maybe\n\n_0 repos skipped_\n')
    const model = buildModel({}, [report])
    const entry = model.scans[0].sections[0].entries[0]
    expect(entry.description).toBeNull()
    expect(entry.language).toBeNull()
  })

  it('populates description and language on ledger rows', () => {
    const model = buildModel(
      {
        'x/y': {
          first_seen: '2026-01-01',
          last_checked: '2026-01-01',
          stars_at_check: 150,
          latest_release_at_check: null,
          verdict: 'maybe',
          profile_checked_against: '2026-01-01',
          description: 'Some project',
          language: 'Rust',
        },
      },
      [],
    )
    expect(model.ledger[0]).toMatchObject({
      repo: 'x/y',
      description: 'Some project',
      language: 'Rust',
    })
  })

  it('sets ledger row description and language to null when seen entry lacks them', () => {
    const model = buildModel(
      {
        'p/q': {
          first_seen: '2026-01-01',
          last_checked: '2026-01-01',
          stars_at_check: 50,
          latest_release_at_check: null,
          verdict: 'fit',
          profile_checked_against: '2026-01-01',
        },
      },
      [],
    )
    expect(model.ledger[0]).toMatchObject({
      repo: 'p/q',
      description: null,
      language: null,
    })
  })

  it('maps section keys to reason values in scan entries', () => {
    const day1 = parseReport('2026-01-01', '## New today\n\n### [a/b](https://github.com/a/b) — ⭐ 100 — ✅ Fit\n\n_0 repos skipped_\n')
    const day2 = parseReport('2026-01-02', '## Resurfaced (major change)\n\n### [c/d](https://github.com/c/d) — ⭐ 200 — 🤔 Maybe\n\n_0 repos skipped_\n')
    const day3 = parseReport('2026-01-03', '## Profile changed — re-evaluated\n\n### [e/f](https://github.com/e/f) — ⭐ 300 — ❌ Not fit\n\n_0 repos skipped_\n')
    const model = buildModel({}, [day1, day2, day3])
    expect(model.scans[0].sections[0].entries[0].reason).toBe('new')
    expect(model.scans[1].sections[0].entries[0].reason).toBe('resurfaced')
    expect(model.scans[2].sections[0].entries[0].reason).toBe('profile-changed')
  })
})
