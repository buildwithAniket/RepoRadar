import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DayHeader } from './components/DayHeader'
import { DayStrip } from './components/DayStrip'
import { Digest } from './components/Digest'
import { Footer } from './components/Footer'
import { Header } from './components/Header'
import { Ledger } from './components/Ledger'
import { model } from './data/load'
import { isoUTC } from './lib/format'

const FLASH_MS = 1600

export function App() {
  const { scans, ledger, totals } = model
  const [sel, setSel] = useState(Math.max(0, scans.length - 1))
  const [flash, setFlash] = useState<string | null>(null)
  const digestRef = useRef<HTMLElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const flashTimer = useRef<number>(0)
  const today = useMemo(() => isoUTC(new Date()), [])

  const selectScan = useCallback(
    (i: number) => {
      setSel((prev) => {
        const next = Math.min(Math.max(i, 0), Math.max(0, scans.length - 1))
        return scans.length === 0 ? prev : next
      })
    },
    [scans.length],
  )

  const onJump = useCallback(
    (repo: string) => {
      const row = ledger.find((r) => r.repo === repo)
      if (!row) return
      const i = scans.findIndex((s) => s.date === row.lastChecked)
      if (i > -1) setSel(i)
      digestRef.current?.scrollIntoView({ block: 'start' })
      window.clearTimeout(flashTimer.current)
      setFlash(repo)
      flashTimer.current = window.setTimeout(() => setFlash(null), FLASH_MS)
    },
    [ledger, scans],
  )

  useEffect(() => () => window.clearTimeout(flashTimer.current), [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      const isEditable = !!target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)
      if (e.key === '/' && !isEditable) {
        e.preventDefault()
        searchRef.current?.focus()
        return
      }
      if (isEditable) return
      if (e.key === 'ArrowLeft') selectScan(sel - 1)
      if (e.key === 'ArrowRight') selectScan(sel + 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sel, selectScan])

  const scan = scans[sel]

  return (
    <>
      <Header totals={totals} />
      <main className="page">
        <div className="wrap">
          {scan ? (
            <>
              <DayHeader
                scan={scan}
                index={sel}
                count={scans.length}
                onPrev={() => selectScan(sel - 1)}
                onNext={() => selectScan(sel + 1)}
              />
              <DayStrip scans={scans} selected={sel} onSelect={selectScan} />
              <section ref={digestRef} aria-live="polite">
                <Digest scan={scan} flash={flash} />
              </section>
            </>
          ) : (
            <p className="empty-state">No scans yet. Run a scan and this page will pick it up.</p>
          )}
          <Ledger ledger={ledger} totals={totals} today={today} onJump={onJump} flashRepo={flash} searchRef={searchRef} />
        </div>
      </main>
      <Footer />
    </>
  )
}
