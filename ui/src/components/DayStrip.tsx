import { useEffect, useRef } from 'react'
import type { Scan } from '../data/parse'
import { shortDate } from '../lib/format'

export function DayStrip({
  scans,
  selected,
  onSelect,
}: {
  scans: Scan[]
  selected: number
  onSelect: (i: number) => void
}) {
  const selectedRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ inline: 'nearest', block: 'nearest' })
    // Only run on mount: the selected day should be visible without smooth-scrolling around
    // afterwards as the user clicks through other days.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="day-strip" role="group" aria-label="Scan days">
      {scans.map((scan, i) => {
        // The visible text is the accessible name; the title expands what the two counts mean.
        const hint = `${scan.counts.fit} worth a look, ${scan.counts.maybe} maybe`
        return (
          <button
            key={scan.date}
            ref={i === selected ? selectedRef : undefined}
            type="button"
            aria-current={i === selected ? 'true' : undefined}
            title={hint}
            onClick={() => onSelect(i)}
          >
            <span>{shortDate(scan.date)}</span>
            <span className="day-strip-count">
              <span className="count-fit">{scan.counts.fit}</span> · <span className="count-maybe">{scan.counts.maybe}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
