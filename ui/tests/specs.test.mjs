import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isoFromStars,
  gaugeFromLanguage,
  exposureFromConfidence,
  repoCode,
  escapeHtml,
  filterRepos,
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

test('repoCode: side A then side B, with the odd Repo on side A', () => {
  assert.deepEqual([0, 1, 2, 3].map(i => repoCode(i, 4)), ['A1', 'A2', 'B1', 'B2']);
  assert.deepEqual([0, 1, 2].map(i => repoCode(i, 3)), ['A1', 'A2', 'B1']);
  assert.equal(repoCode(0, 1), 'A1');
});

test('repoCode: empty or missing totals give A1', () => {
  assert.equal(repoCode(0, 0), 'A1');
  assert.equal(repoCode(5), 'A1');
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
