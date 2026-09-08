// Pure parsing + model assembly. Mirrors what src/report.py writes so the page can read the
// committed digests back without any extra export step.

export type Verdict = 'fit' | 'maybe' | 'not-fit'
export type Reason = 'new' | 'resurfaced' | 'profile-changed'

export interface SeenEntry {
  first_seen: string
  last_checked: string
  stars_at_check: number
  latest_release_at_check: string | null
  verdict: Verdict
  profile_checked_against: string
  /** GitHub repo description (public data). Absent on entries written before v2. */
  description?: string | null
  /** GitHub primary language (public data). Absent on entries written before v2. */
  language?: string | null
}

export interface ReportEntry {
  repo: string
  stars: number
  verdict: Verdict
}
export interface ReportSection {
  key: string
  entries: ReportEntry[]
}
export interface Report {
  date: string
  skipped: number
  sections: ReportSection[]
}

export interface ScanEntry extends ReportEntry {
  reason: Reason | string
  description: string | null
  language: string | null
  priorStars: number | null
  priorVerdict: Verdict | null
  priorDate: string | null
}
export interface ScanSection {
  key: string
  entries: ScanEntry[]
}
export interface Scan {
  date: string
  skipped: number
  evaluated: number
  trending: number
  counts: Record<Verdict, number>
  sections: ScanSection[]
}
export interface LedgerRow {
  repo: string
  verdict: Verdict
  stars: number
  description: string | null
  language: string | null
  firstSeen: string
  lastChecked: string
  appearances: number
  lastReason: string | null
}
export interface Totals {
  repos: number
  fit: number
  maybe: number
  notFit: number
  scans: number
  evaluated: number
  skipped: number
  firstScan: string | null
  lastScan: string | null
}
export interface Model {
  scans: Scan[]
  ledger: LedgerRow[]
  totals: Totals
}

const SECTION_KEYS: Record<string, Reason> = {
  'New today': 'new',
  'Resurfaced (major change)': 'resurfaced',
  'Profile changed — re-evaluated': 'profile-changed',
}
const BADGES: Record<string, Verdict> = {
  '✅ Fit': 'fit',
  '🤔 Maybe': 'maybe',
  '❌ Not fit': 'not-fit',
}
const ENTRY_RE = /^### \[([^\]]+)\]\(https:\/\/github\.com\/[^)]+\) — ⭐ (\d+) — (.+?)\s*$/
const SECTION_RE = /^## (.+?)\s*$/
const SKIPPED_RE = /^_(\d+) repos? skipped/

export const VERDICTS: Verdict[] = ['fit', 'maybe', 'not-fit']

export function isVerdict(v: string): v is Verdict {
  return v === 'fit' || v === 'maybe' || v === 'not-fit'
}

export function parseReport(date: string, text: string): Report {
  const sections: ReportSection[] = []
  let current: ReportSection | null = null
  let skipped = 0
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd()
    const sec = SECTION_RE.exec(line)
    if (sec) {
      current = { key: SECTION_KEYS[sec[1]] ?? sec[1], entries: [] }
      sections.push(current)
      continue
    }
    const entry = ENTRY_RE.exec(line)
    if (entry && current) {
      const badge = entry[3]
      const verdict = BADGES[badge] ?? (isVerdict(badge) ? badge : 'not-fit')
      current.entries.push({ repo: entry[1], stars: Number(entry[2]), verdict })
      continue
    }
    const skip = SKIPPED_RE.exec(line)
    if (skip) skipped = Number(skip[1])
  }
  return { date, skipped, sections }
}

interface Appearance {
  date: string
  stars: number
  verdict: Verdict
  reason: string
}

export function buildModel(seen: Record<string, SeenEntry>, reports: Report[]): Model {
  const history = new Map<string, Appearance[]>()
  const scans: Scan[] = []

  for (const report of reports) {
    const counts: Record<Verdict, number> = { fit: 0, maybe: 0, 'not-fit': 0 }
    const sections: ScanSection[] = report.sections.map((section) => ({
      key: section.key,
      entries: section.entries.map((entry) => {
        const prior = history.get(entry.repo)?.at(-1) ?? null
        const seenEntry = seen[entry.repo]
        counts[entry.verdict] += 1
        return {
          ...entry,
          reason: section.key as Reason,
          description: seenEntry?.description ?? null,
          language: seenEntry?.language ?? null,
          priorStars: prior?.stars ?? null,
          priorVerdict: prior?.verdict ?? null,
          priorDate: prior?.date ?? null,
        }
      }),
    }))
    // Record history only after the whole scan is processed so priors always come from
    // earlier scans, never from the same day.
    for (const section of report.sections) {
      for (const entry of section.entries) {
        const list = history.get(entry.repo) ?? []
        list.push({ date: report.date, stars: entry.stars, verdict: entry.verdict, reason: section.key })
        history.set(entry.repo, list)
      }
    }
    const evaluated = counts.fit + counts.maybe + counts['not-fit']
    scans.push({
      date: report.date,
      skipped: report.skipped,
      evaluated,
      trending: evaluated + report.skipped,
      counts,
      sections,
    })
  }

  const ledger: LedgerRow[] = Object.keys(seen)
    .sort()
    .map((repo) => {
      const e = seen[repo]
      const list = history.get(repo) ?? []
      return {
        repo,
        verdict: isVerdict(e.verdict) ? e.verdict : 'not-fit',
        stars: e.stars_at_check ?? 0,
        description: e.description ?? null,
        language: e.language ?? null,
        firstSeen: e.first_seen,
        lastChecked: e.last_checked,
        appearances: Math.max(1, list.length),
        lastReason: list.at(-1)?.reason ?? null,
      }
    })

  const totals: Totals = {
    repos: ledger.length,
    fit: ledger.filter((r) => r.verdict === 'fit').length,
    maybe: ledger.filter((r) => r.verdict === 'maybe').length,
    notFit: ledger.filter((r) => r.verdict === 'not-fit').length,
    scans: scans.length,
    evaluated: scans.reduce((n, s) => n + s.evaluated, 0),
    skipped: scans.reduce((n, s) => n + s.skipped, 0),
    firstScan: scans[0]?.date ?? null,
    lastScan: scans.at(-1)?.date ?? null,
  }
  return { scans, ledger, totals }
}
