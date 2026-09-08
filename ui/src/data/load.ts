// Reads the repo's committed state directly. In `vite dev` these are live file imports, so a
// finished scan (new report + updated seen-repos.json) refreshes the page while it is open.
import seenJson from '../../../seen-repos.json'
import { buildModel, parseReport, type Report, type SeenEntry } from './parse'

const files = import.meta.glob('../../../reports/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const reports: Report[] = Object.entries(files)
  .map(([path, text]) => {
    const m = /(\d{4}-\d{2}-\d{2})\.md$/.exec(path)
    return m ? parseReport(m[1], text) : null
  })
  .filter((r): r is Report => r !== null)
  .sort((a, b) => a.date.localeCompare(b.date))

export const model = buildModel(seenJson as unknown as Record<string, SeenEntry>, reports)
