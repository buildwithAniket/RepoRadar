// Editions: owns Digest access, the available Edition dates, the active Edition and switching.
// State is module-private; other modules use the functions below.
import { countVerdicts } from './specs.js';

const FALLBACK_DATE = '2026-09-02';

let digests = null;
let availableDates = [];
let activeDate = null;
let activeRepos = [];

export async function initEditions() {
  digests = (typeof window !== 'undefined' && window.REPORADAR_DIGESTS) ? window.REPORADAR_DIGESTS : null;
  if (digests && Object.keys(digests).length > 0) {
    availableDates = Object.keys(digests).sort();
    // Load the latest available Edition by default.
    activeDate = availableDates[availableDates.length - 1];
    activeRepos = reposOf(digests[activeDate]);
  } else {
    const { fallbackRepos } = await import('./fallback-repos.js');
    activeDate = FALLBACK_DATE;
    availableDates = [activeDate];
    activeRepos = fallbackRepos;
  }
}

function reposOf(digest) {
  return (digest && digest.repos) ? digest.repos : [];
}

export function getAvailableDates() {
  return availableDates;
}

export function getActiveDate() {
  return activeDate;
}

export function getActiveRepos() {
  return activeRepos;
}

// The Digest entry for an Edition date, or null/undefined when there is none (fallback data).
export function getDigest(date) {
  return digests ? digests[date] : null;
}

// An Edition's Repo count and Verdict stats: { count, stats: { fit, maybe, notFit, total } }.
// Prefers the Digest's precomputed evaluated count and stats, and counts the Repos for
// whatever it lacks (including the fallback Repos when there is no Digest).
export function editionSummary(date) {
  const digest = getDigest(date);
  const repos = digest ? reposOf(digest) : activeRepos;
  const counted = countVerdicts(repos);
  const stats = digest && digest.stats ? {
    fit: digest.stats.fit ?? 0,
    maybe: digest.stats.maybe ?? 0,
    notFit: digest.stats.notFit ?? 0,
    total: digest.stats.total ?? repos.length
  } : counted;
  const count = digest && digest.evaluatedCount !== undefined ? digest.evaluatedCount : repos.length;
  return { count, stats };
}

export function canSwitchTo(date) {
  return date !== activeDate && availableDates.includes(date);
}

// Makes `date` the active Edition and returns its Digest entry.
export function setActiveEdition(date) {
  activeDate = date;
  const digest = getDigest(date);
  activeRepos = reposOf(digest);
  return digest;
}

// Previous/next Edition date relative to the active one, or null at either end.
export function adjacentDate(step) {
  const idx = availableDates.indexOf(activeDate);
  const next = idx + step;
  if (idx < 0 || next < 0 || next >= availableDates.length) return null;
  return availableDates[next];
}
