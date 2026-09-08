import type { Totals } from '../data/parse'
import { fmt, shortDate } from '../lib/format'

export function Header({ totals }: { totals: Totals }) {
  return (
    <header className="site-header">
      <div className="wrap">
        <h1 className="wordmark">RepoRadar</h1>
        {totals.firstScan && (
          <p className="header-meta">
            <span className="num">{fmt(totals.repos)}</span> repos on file ·{' '}
            <span className="num">{fmt(totals.scans)}</span> scans · since {shortDate(totals.firstScan)}
          </p>
        )}
      </div>
    </header>
  )
}
