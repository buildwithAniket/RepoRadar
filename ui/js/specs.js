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
    if (verdict !== 'all' && repo.verdict !== verdict) return;
    if (query) {
      const fields = [repo.name, repo.owner, repo.language].map(f => (f || '').toLowerCase());
      if (!fields.some(f => f.includes(query))) return;
    }
    out.push({ repo, idx });
  });
  return out;
}
