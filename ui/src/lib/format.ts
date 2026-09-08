import type { Verdict } from '../data/parse'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export const VERDICT_LABEL: Record<Verdict, string> = { fit: 'Worth a look', maybe: 'Maybe', 'not-fit': 'Passed' }
export const VERDICT_CLASS: Record<Verdict, string> = { fit: 'fit', maybe: 'maybe', 'not-fit': 'notfit' }
export const REASON_LABEL: Record<string, string> = {
  new: 'New',
  resurfaced: 'Back with a big change',
  'profile-changed': 'Re-judged after profile change',
}

export const fmt = (n: number) => Math.round(n).toLocaleString('en-US')
export const pad2 = (n: number) => String(n).padStart(2, '0')

export function shortDate(iso: string) {
  const [, m, d] = iso.split('-')
  return `${d} ${MONTHS[Number(m) - 1]}`
}
export function longDate(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`
}
export function longDateWithWeekday(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  const day = DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
  return `${day}, ${Number(d)} ${MONTHS_LONG[m - 1]}`
}
export function weekday(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
}
export function isoUTC(t: Date) {
  return `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`
}
export function daysBetween(fromIso: string, toIso: string) {
  const [a, b] = [fromIso, toIso].map((s) => {
    const [y, m, d] = s.split('-').map(Number)
    return Date.UTC(y, m - 1, d)
  })
  return Math.round((b - a) / 86_400_000)
}
export function relDays(iso: string, todayIso: string) {
  const n = daysBetween(iso, todayIso)
  if (n <= 0) return 'today'
  if (n === 1) return 'yesterday'
  return `${n} days ago`
}
export function splitRepo(full: string): [string, string] {
  const i = full.indexOf('/')
  return i > -1 ? [full.slice(0, i + 1), full.slice(i + 1)] : ['', full]
}

export const prefersReducedMotion = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
