import type { ScanEntry } from '../data/parse'
import { fmt, REASON_LABEL, splitRepo, VERDICT_CLASS } from '../lib/format'

export function RepoRow({ entry, flash }: { entry: ScanEntry; flash: boolean }) {
  const [owner, name] = splitRepo(entry.repo)
  const hasDelta = typeof entry.priorStars === 'number' && entry.priorStars !== entry.stars
  const delta = hasDelta ? (entry.stars > (entry.priorStars as number) ? '↑' : '↓') : null

  return (
    <a
      className={`repo-row-link ${VERDICT_CLASS[entry.verdict]}${flash ? ' is-flash' : ''}`}
      href={`https://github.com/${entry.repo}`}
      target="_blank"
      rel="noopener noreferrer"
    >
      <div>
        <span className="repo-owner">{owner}</span>
        <span className="repo-name">{name}</span>
      </div>
      <p className={`repo-desc${entry.description ? '' : ' is-empty'}`}>{entry.description || 'No description'}</p>
      <div className="repo-meta">
        {entry.language && <span>{entry.language}</span>}
        <span className="stars">★ {fmt(entry.stars)}</span>
        {delta && (
          <span className="stars">
            {delta} from {fmt(entry.priorStars as number)}
          </span>
        )}
        {entry.reason !== 'new' && (
          <span className="reason-chip">{REASON_LABEL[entry.reason] ?? entry.reason}</span>
        )}
      </div>
    </a>
  )
}
