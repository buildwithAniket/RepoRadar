import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isoFromStars,
  gaugeFromLanguage,
  exposureFromConfidence,
  repoPosition,
  escapeHtml,
  filterRepos,
  verdictPresentation,
  filterName,
  countVerdicts,
} from '../js/specs.js';

test('isoFromStars: thresholds are inclusive on the upper bound', () => {
  assert.equal(isoFromStars(0), 'ISO 25 · MICRO NICHE');
  assert.equal(isoFromStars(50), 'ISO 25 · MICRO NICHE');
  assert.equal(isoFromStars(51), 'ISO 50 · FINE GRAIN');
  assert.equal(isoFromStars(500), 'ISO 50 · FINE GRAIN');
  assert.equal(isoFromStars(501), 'ISO 100 · BALANCED');
  assert.equal(isoFromStars(2000), 'ISO 100 · BALANCED');
  assert.equal(isoFromStars(2001), 'ISO 400 · HIGH SPEED');
  assert.equal(isoFromStars(10000), 'ISO 400 · HIGH SPEED');
  assert.equal(isoFromStars(10001), 'ISO 800 · PUSH PROCESS');
  assert.equal(isoFromStars(50000), 'ISO 800 · PUSH PROCESS');
  assert.equal(isoFromStars(50001), 'ISO 1600 · ULTRA FAST');
});

test('isoFromStars: missing stars default to the lowest band', () => {
  assert.equal(isoFromStars(), 'ISO 25 · MICRO NICHE');
});

test('gaugeFromLanguage: known languages', () => {
  assert.equal(gaugeFromLanguage('Python'), 'Python · 16mm Reversal');
  assert.equal(gaugeFromLanguage('C++'), 'C++ · 65mm IMAX');
  assert.equal(gaugeFromLanguage('Rust'), 'Rust · Digital RAW 8K');
});

test('gaugeFromLanguage: unknown or missing languages fall back to 35mm', () => {
  assert.equal(gaugeFromLanguage('Haskell'), 'Haskell · 35mm Format');
  assert.equal(gaugeFromLanguage(), 'Unknown · 35mm Format');
  assert.equal(gaugeFromLanguage('Unknown'), 'Unknown · 35mm Format');
  assert.equal(gaugeFromLanguage('toString'), 'toString · 35mm Format');
});

test('exposureFromConfidence: levels, missing and unrecognised values', () => {
  assert.equal(exposureFromConfidence('high'), '+1 EV · HIGH CERTAINTY');
  assert.equal(exposureFromConfidence('medium'), '±0 EV · BALANCED READ');
  assert.equal(exposureFromConfidence('low'), '-1 EV · LOW CONFIDENCE');
  assert.equal(exposureFromConfidence(), '-1 EV · LOW CONFIDENCE');
  assert.equal(exposureFromConfidence('bogus'), '-1 EV · LOW CONFIDENCE');
});

test('repoPosition: an even total splits evenly between side A and side B', () => {
  assert.deepEqual([0, 1, 2, 3].map(i => repoPosition(i, 4)), [
    { code: 'A1', side: 'A' }, { code: 'A2', side: 'A' },
    { code: 'B1', side: 'B' }, { code: 'B2', side: 'B' },
  ]);
});

test('repoPosition: an odd total puts the extra Repo on side A', () => {
  assert.deepEqual([0, 1, 2].map(i => repoPosition(i, 3)), [
    { code: 'A1', side: 'A' }, { code: 'A2', side: 'A' }, { code: 'B1', side: 'B' },
  ]);
  assert.deepEqual([2, 3].map(i => repoPosition(i, 5)), [
    { code: 'A3', side: 'A' }, { code: 'B1', side: 'B' },
  ]);
});

test('repoPosition: the first B track is the first index past the half-way point', () => {
  assert.deepEqual(repoPosition(4, 10), { code: 'A5', side: 'A' });
  assert.deepEqual(repoPosition(5, 10), { code: 'B1', side: 'B' });
  assert.deepEqual(repoPosition(5, 11), { code: 'A6', side: 'A' });
  assert.deepEqual(repoPosition(6, 11), { code: 'B1', side: 'B' });
});

test('repoPosition: a single Repo is A1 on side A', () => {
  assert.deepEqual(repoPosition(0, 1), { code: 'A1', side: 'A' });
});

test('repoPosition: empty or missing totals give A1 on side A', () => {
  assert.deepEqual(repoPosition(0, 0), { code: 'A1', side: 'A' });
  assert.deepEqual(repoPosition(5), { code: 'A1', side: 'A' });
});

test('escapeHtml: escapes the five special characters', () => {
  assert.equal(escapeHtml(`<a href="x">&'</a>`), '&lt;a href=&quot;x&quot;&gt;&amp;&#039;&lt;/a&gt;');
});

test('escapeHtml: null, undefined and non-strings', () => {
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
  assert.equal(escapeHtml(0), '0');
});

const repos = [
  { name: 'Hermes-Agent', owner: 'NousResearch', language: 'Python', verdict: 'fit' },
  { name: 'substrate', owner: 'agent-substrate', language: 'TypeScript', verdict: 'maybe' },
  { name: 'Sequoia-X', owner: 'sngyai', language: 'Python', verdict: 'not-fit' },
  { name: null, owner: null, language: null, verdict: 'fit' },
];

test('filterRepos: no filter returns every Repo with its index', () => {
  const out = filterRepos(repos, { verdict: 'all', search: '' });
  assert.deepEqual(out.map(i => i.idx), [0, 1, 2, 3]);
  assert.equal(out[1].repo, repos[1]);
});

test('filterRepos: verdict filter keeps original indexes', () => {
  const out = filterRepos(repos, { verdict: 'fit', search: '' });
  assert.deepEqual(out.map(i => i.idx), [0, 3]);
});

test('filterRepos: search matches name, owner or language, case-insensitively and trimmed', () => {
  assert.deepEqual(filterRepos(repos, { verdict: 'all', search: '  HERMES ' }).map(i => i.idx), [0]);
  assert.deepEqual(filterRepos(repos, { verdict: 'all', search: 'sngyai' }).map(i => i.idx), [2]);
  assert.deepEqual(filterRepos(repos, { verdict: 'all', search: 'python' }).map(i => i.idx), [0, 2]);
});

test('filterRepos: search and verdict combine', () => {
  assert.deepEqual(filterRepos(repos, { verdict: 'not-fit', search: 'python' }).map(i => i.idx), [2]);
});

test('filterRepos: whitespace-only search is empty; unmatched search and empty list give []', () => {
  assert.equal(filterRepos(repos, { verdict: 'all', search: '   ' }).length, 4);
  assert.deepEqual(filterRepos(repos, { verdict: 'all', search: 'zzz' }), []);
  assert.deepEqual(filterRepos([], { verdict: 'all', search: '' }), []);
});

test('verdictPresentation: each Verdict key maps to its canonical label, filter name, glyph and icon', () => {
  const fit = verdictPresentation({ verdict: 'fit' });
  const maybe = verdictPresentation({ verdict: 'maybe' });
  const notFit = verdictPresentation({ verdict: 'not-fit' });
  assert.deepEqual([fit.key, fit.label, fit.filterName, fit.glyph], ['fit', 'OFFICIAL SELECTION', 'SELECTS', '★']);
  assert.deepEqual([maybe.key, maybe.label, maybe.filterName, maybe.glyph], ['maybe', 'UNDER REVIEW', 'REVIEW', '◐']);
  assert.deepEqual([notFit.key, notFit.label, notFit.filterName, notFit.glyph], ['not-fit', 'ARCHIVED / PASS', 'PASS', '✕']);
  for (const p of [fit, maybe, notFit]) assert.match(p.icon, /^<svg /);
  assert.equal(new Set([fit.icon, maybe.icon, notFit.icon]).size, 3);
});

test('verdictPresentation: a Repo\'s own verdictLabel overrides the canonical label only', () => {
  const p = verdictPresentation({ verdict: 'fit', verdictLabel: 'CRITICS PICK' });
  assert.equal(p.label, 'CRITICS PICK');
  assert.equal(p.key, 'fit');
  assert.equal(p.filterName, 'SELECTS');
  assert.equal(p.glyph, '★');
});

test('verdictPresentation: an empty, blank or non-string verdictLabel falls back to the canonical label', () => {
  assert.equal(verdictPresentation({ verdict: 'maybe', verdictLabel: '' }).label, 'UNDER REVIEW');
  assert.equal(verdictPresentation({ verdict: 'maybe', verdictLabel: null }).label, 'UNDER REVIEW');
  assert.equal(verdictPresentation({ verdict: 'maybe', verdictLabel: 7 }).label, 'UNDER REVIEW');
  assert.equal(verdictPresentation({ verdict: 'maybe', verdictLabel: '   ' }).label, 'UNDER REVIEW');
});

test('verdictPresentation: missing or unknown Verdicts are not fit', () => {
  const notFit = verdictPresentation({ verdict: 'not-fit' });
  assert.deepEqual(verdictPresentation({}), notFit);
  assert.deepEqual(verdictPresentation({ verdict: 'bogus' }), notFit);
  assert.deepEqual(verdictPresentation({ verdict: 'toString' }), notFit);
  assert.deepEqual(verdictPresentation({ verdict: 'all' }), notFit);
  assert.deepEqual(verdictPresentation(null), notFit);
  assert.deepEqual(verdictPresentation(undefined), notFit);
});

test('verdictPresentation: an unknown Verdict still honours the Repo\'s own label', () => {
  const p = verdictPresentation({ verdict: 'bogus', verdictLabel: 'VERDICT PENDING' });
  assert.equal(p.key, 'not-fit');
  assert.equal(p.label, 'VERDICT PENDING');
});

test('filterName: one name per Tracklist filter value, "all" reads ALL', () => {
  assert.equal(filterName('all'), 'ALL');
  assert.equal(filterName('fit'), 'SELECTS');
  assert.equal(filterName('maybe'), 'REVIEW');
  assert.equal(filterName('not-fit'), 'PASS');
});

test('filterName: unrecognised values fall back to ALL', () => {
  assert.equal(filterName('bogus'), 'ALL');
  assert.equal(filterName(), 'ALL');
  assert.equal(filterName('toString'), 'ALL');
});

test('filterRepos: Repos with a missing or unknown Verdict match the not-fit filter', () => {
  const odd = [{ name: 'a' }, { name: 'b', verdict: 'bogus' }, { name: 'c', verdict: 'fit' }];
  assert.deepEqual(filterRepos(odd, { verdict: 'not-fit' }).map(i => i.idx), [0, 1]);
  assert.deepEqual(filterRepos(odd, { verdict: 'fit' }).map(i => i.idx), [2]);
});

test('countVerdicts: an empty list counts zero of everything', () => {
  assert.deepEqual(countVerdicts([]), { fit: 0, maybe: 0, notFit: 0, total: 0 });
});

test('countVerdicts: a mixed list counts each Verdict and the total', () => {
  const repos = [
    { verdict: 'fit' }, { verdict: 'maybe' }, { verdict: 'fit' },
    { verdict: 'not-fit' }, { verdict: 'maybe' }, { verdict: 'fit' },
  ];
  assert.deepEqual(countVerdicts(repos), { fit: 3, maybe: 2, notFit: 1, total: 6 });
});

test('countVerdicts: missing or unknown Verdicts count as not fit, matching the not-fit filter', () => {
  const repos = [{ name: 'a' }, { verdict: 'bogus' }, { verdict: 'fit' }];
  assert.deepEqual(countVerdicts(repos), { fit: 1, maybe: 0, notFit: 2, total: 3 });
  assert.equal(countVerdicts(repos).notFit, filterRepos(repos, { verdict: 'not-fit' }).length);
});
