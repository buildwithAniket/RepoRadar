import { useMemo, useState } from 'react'
import type { LedgerRow, Totals, Verdict } from '../data/parse'
import { longDate, shortDate, VERDICT_CLASS, VERDICT_LABEL, fmt } from '../lib/format'

type SortKey = 'repo' | 'language' | 'stars' | 'verdict' | 'firstSeen' | 'lastChecked'
type SortDir = 'asc' | 'desc'

const FILTERS: { key: Verdict | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'fit', label: 'Worth a look' },
  { key: 'maybe', label: 'Maybe' },
  { key: 'not-fit', label: 'Passed' },
]

const HEADERS: { key: SortKey; label: string }[] = [
  { key: 'repo', label: 'Repo' },
  { key: 'language', label: 'Language' },
  { key: 'stars', label: 'Stars' },
  { key: 'verdict', label: 'Verdict' },
  { key: 'firstSeen', label: 'First seen' },
  { key: 'lastChecked', label: 'Last checked' },
]

function compare(a: LedgerRow, b: LedgerRow, key: SortKey): number {
  switch (key) {
    case 'repo':
      return a.repo.localeCompare(b.repo)
    case 'language':
      return (a.language ?? '').localeCompare(b.language ?? '')
    case 'stars':
      return a.stars - b.stars
    case 'verdict':
      return a.verdict.localeCompare(b.verdict)
    case 'firstSeen':
      return a.firstSeen.localeCompare(b.firstSeen)
    case 'lastChecked': {
      const byDate = a.lastChecked.localeCompare(b.lastChecked)
      return byDate !== 0 ? byDate : a.stars - b.stars
    }
  }
}

export function Ledger({
  ledger,
  totals,
  onJump,
  flashRepo,
  searchRef,
}: {
  ledger: LedgerRow[]
  totals: Totals
  today: string
  onJump: (repo: string) => void
  flashRepo?: string | null
  searchRef?: React.RefObject<HTMLInputElement | null>
}) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Verdict | 'all'>('all')
  const [sortKey, setSortKey] = useState<SortKey>('lastChecked')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const counts = {
    all: totals.repos,
    fit: totals.fit,
    maybe: totals.maybe,
    'not-fit': totals.notFit,
  }

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = ledger.filter((row) => {
      if (filter !== 'all' && row.verdict !== filter) return false
      if (!q) return true
      return row.repo.toLowerCase().includes(q) || (row.description ?? '').toLowerCase().includes(q)
    })
    const sorted = [...filtered].sort((a, b) => compare(a, b, sortKey))
    if (sortDir === 'desc') sorted.reverse()
    return sorted
  }, [ledger, query, filter, sortKey, sortDir])

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir(key === 'repo' || key === 'language' || key === 'verdict' ? 'asc' : 'desc')
    }
  }

  return (
    <section className="ledger">
      <h2>Everything on file</h2>
      <div className="ledger-controls">
        <input
          ref={searchRef}
          type="search"
          className="ledger-search"
          placeholder="Search repo or description"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search the ledger by repo or description"
        />
        <div className="verdict-filter">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}
            >
              {f.label} ({fmt(counts[f.key])})
            </button>
          ))}
        </div>
      </div>
      <div className="table-wrap">
        <table className="ledger-table">
          <thead>
            <tr>
              {HEADERS.map((h) => (
                <th key={h.key} aria-sort={sortKey === h.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                  <button type="button" onClick={() => toggleSort(h.key)}>
                    {h.label}
                    {sortKey === h.key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                  </button>
                </th>
              ))}
              <th>
                <span className="sr-only">Jump to scan</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.repo} className={row.repo === flashRepo ? 'is-flash' : undefined}>
                <td className="ledger-repo-cell">
                  <div className="ledger-repo-name">{row.repo}</div>
                  <div className="ledger-repo-desc">{row.description || 'No description'}</div>
                </td>
                <td>{row.language || '—'}</td>
                <td className="num">{fmt(row.stars)}</td>
                <td>
                  <span className={`verdict-dot ${VERDICT_CLASS[row.verdict]}`}>{VERDICT_LABEL[row.verdict]}</span>
                </td>
                <td title={longDate(row.firstSeen)}>{shortDate(row.firstSeen)}</td>
                <td title={longDate(row.lastChecked)}>{shortDate(row.lastChecked)}</td>
                <td>
                  <button type="button" className="scan-jump" onClick={() => onJump(row.repo)}>
                    scan →
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="ledger-empty">No repos match.</p>}
      </div>
    </section>
  )
}
