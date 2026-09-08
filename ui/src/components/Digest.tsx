import { useMemo } from 'react'
import type { Scan, ScanEntry, Verdict } from '../data/parse'
import { VERDICT_LABEL } from '../lib/format'
import { RepoRow } from './RepoRow'

function groupByVerdict(scan: Scan): Record<Verdict, ScanEntry[]> {
  const groups: Record<Verdict, ScanEntry[]> = { fit: [], maybe: [], 'not-fit': [] }
  for (const section of scan.sections) {
    for (const entry of section.entries) {
      groups[entry.verdict].push(entry)
    }
  }
  for (const verdict of Object.keys(groups) as Verdict[]) {
    groups[verdict].sort((a, b) => b.stars - a.stars)
  }
  return groups
}

export function Digest({ scan, flash }: { scan: Scan; flash: string | null }) {
  const groups = useMemo(() => groupByVerdict(scan), [scan])

  return (
    <div>
      {(['fit', 'maybe'] as Verdict[]).map((verdict) =>
        groups[verdict].length > 0 ? (
          <section className="digest-group" key={verdict}>
            <h2>{VERDICT_LABEL[verdict]}</h2>
            <div className="digest-list">
              {groups[verdict].map((entry) => (
                <RepoRow key={entry.repo} entry={entry} flash={entry.repo === flash} />
              ))}
            </div>
          </section>
        ) : null,
      )}
      {groups['not-fit'].length > 0 && (
        <details className="passed-details digest-group">
          <summary>Passed on {groups['not-fit'].length} repos</summary>
          <div className="digest-list">
            {groups['not-fit'].map((entry) => (
              <RepoRow key={entry.repo} entry={entry} flash={entry.repo === flash} />
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
