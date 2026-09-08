import type { Scan } from '../data/parse'
import { fmt, longDateWithWeekday } from '../lib/format'

function summarize(scan: Scan) {
  const { trending, evaluated, skipped, counts } = scan
  let sentence: string
  if (evaluated === 0) {
    sentence = `Nothing new or changed. All ${fmt(trending)} trending repos were already on file.`
  } else {
    sentence = `Looked at ${fmt(trending)} trending repos. Judged ${fmt(evaluated)} that were new or changed, skipped ${fmt(skipped)} already on file.`
  }
  if (counts.fit > 0) {
    sentence += ` ${counts.fit === 1 ? '1' : fmt(counts.fit)} worth a look.`
  }
  return sentence
}

export function DayHeader({
  scan,
  index,
  count,
  onPrev,
  onNext,
}: {
  scan: Scan
  index: number
  count: number
  onPrev: () => void
  onNext: () => void
}) {
  return (
    <div className="day-header">
      <div className="day-header-row">
        <p className="day-date">{longDateWithWeekday(scan.date)}</p>
        <div className="day-nav">
          <button type="button" onClick={onPrev} disabled={index <= 0} aria-label="Previous day">
            ←
          </button>
          <button type="button" onClick={onNext} disabled={index >= count - 1} aria-label="Next day">
            →
          </button>
        </div>
      </div>
      <p className="day-summary">{summarize(scan)}</p>
    </div>
  )
}
