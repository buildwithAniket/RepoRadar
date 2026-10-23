// Pure Repo-to-display mappings and Tracklist filtering. No DOM, no WebGL, no state.

export function isoFromStars(stars = 0) {
  if (stars <= 50) return 'ISO 25 · MICRO NICHE';
  if (stars <= 500) return 'ISO 50 · FINE GRAIN';
  if (stars <= 2000) return 'ISO 100 · BALANCED';
  if (stars <= 10000) return 'ISO 400 · HIGH SPEED';
  if (stars <= 50000) return 'ISO 800 · PUSH PROCESS';
  return 'ISO 1600 · ULTRA FAST';
}

const GAUGES = {
  'Python': 'Python · 16mm Reversal',
  'TypeScript': 'TypeScript · 35mm Color Neg',
  'JavaScript': 'JavaScript · Super 8mm',
  'C': 'C · 70mm Direct Optical',
  'C++': 'C++ · 65mm IMAX',
  'Go': 'Go · 35mm VistaVision',
  'Rust': 'Rust · Digital RAW 8K',
  'Markdown': 'Markdown · Contact Sheet',
  'Unknown': 'Unknown · 35mm Format'
};

export function gaugeFromLanguage(language = 'Unknown') {
  return Object.hasOwn(GAUGES, language) ? GAUGES[language] : `${language} · 35mm Format`;
}

export function exposureFromConfidence(confidence = 'low') {
  if (confidence === 'high') return '+1 EV · HIGH CERTAINTY';
  if (confidence === 'medium') return '±0 EV · BALANCED READ';
  return '-1 EV · LOW CONFIDENCE';
}

// One row per Verdict: canonical display label, the glyph drawn on the Disc label, and the
// same star / half-circle / cross as SVG markup for the Tracklist row badge.
const VERDICTS = {
  'fit': {
    label: 'OFFICIAL SELECTION',
    glyph: '★',
    icon: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 2l2.4 7.4h7.6l-6.2 4.5 2.4 7.4-6.2-4.5-6.2 4.5 2.4-7.4-6.2-4.5h7.6z"/></svg>'
  },
  'maybe': {
    label: 'UNDER REVIEW',
    glyph: '◐',
    icon: '<svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/></svg>'
  },
  'not-fit': {
    label: 'ARCHIVED / PASS',
    glyph: '✕',
    icon: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>'
  }
};

// Tracklist filter value to display name; "all" is the only value that is not a Verdict.
const FILTER_NAMES = { 'all': 'ALL', 'fit': 'SELECTS', 'maybe': 'REVIEW', 'not-fit': 'PASS' };

export function filterName(value) {
  return Object.hasOwn(FILTER_NAMES, value) ? FILTER_NAMES[value] : FILTER_NAMES.all;
}

// How a Repo's Verdict is shown everywhere: { key, label, filterName, glyph, icon }.
// A missing or unrecognised Verdict is treated as not fit. The Repo's own verdictLabel,
// when non-blank, replaces the canonical label.
export function verdictPresentation(repo) {
  const raw = repo && repo.verdict;
  const key = Object.hasOwn(VERDICTS, raw) ? raw : 'not-fit';
  const own = repo && repo.verdictLabel;
  return {
    key,
    label: typeof own === 'string' && own.trim() ? own : VERDICTS[key].label,
    filterName: FILTER_NAMES[key],
    glyph: VERDICTS[key].glyph,
    icon: VERDICTS[key].icon
  };
}

// Side A holds the first half (rounded up) of the Edition, side B the rest.
export function repoCode(index, totalCount) {
  if (!totalCount || totalCount <= 0) return 'A1';
  const half = Math.ceil(totalCount / 2);
  return index < half ? 'A' + (index + 1) : 'B' + (index - half + 1);
}

export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Returns [{ repo, idx }] for Repos matching the verdict ('all' for any) and the
// case-insensitive search over name, owner and language. idx is the index in `repos`.
export function filterRepos(repos, { verdict = 'all', search = '' } = {}) {
  const query = search.toLowerCase().trim();
  const out = [];
  repos.forEach((repo, idx) => {
    if (verdict !== 'all' && verdictPresentation(repo).key !== verdict) return;
    if (query) {
      const fields = [repo.name, repo.owner, repo.language].map(f => (f || '').toLowerCase());
      if (!fields.some(f => f.includes(query))) return;
    }
    out.push({ repo, idx });
  });
  return out;
}
