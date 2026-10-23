// Docket: owns rendering of the detail panel (Verdict laurel, title, stats, critic quote,
// Director's Notes use-cases, specs grid, links) and its empty-Edition state.
// Callers pass what to show and an optional callback run once the Docket has updated.
import { isoFromStars, gaugeFromLanguage, exposureFromConfidence, verdictPresentation } from './specs.js';

const SWITCH_DELAY_MS = 200;

let docketWrap = null;

function wrap() {
  if (!docketWrap) docketWrap = document.getElementById('docket-wrap');
  return docketWrap;
}

function setText(id, text) {
  document.getElementById(id).textContent = text;
}

export function renderRepo(repo, { index, total, date }, onRendered) {
  wrap().classList.add('switching');

  setTimeout(() => {
    // Update tags
    setText('docket-tag', `ARCHIVE ENTRY · ${String(index + 1).padStart(2, '0')} OF ${String(total).padStart(2, '0')}`);

    // Laurel & Badge
    const verdict = verdictPresentation(repo);
    document.getElementById('docket-laurel').className = `verdict-laurel-badge ${verdict.key}`;
    setText('docket-verdict-text', verdict.label);

    // Title & Studio
    setText('docket-title', repo.name || 'Untitled');
    setText('docket-author', repo.owner || 'Unknown');
    setText('docket-stars', `${(repo.stars || 0).toLocaleString()} ★ STARS`);

    // LLM Quote
    setText('docket-quote', `“${repo.reason || 'No evaluation notes recorded.'}”`);
    renderUseCases(repo);

    // Spec Grid
    setText('docket-iso', isoFromStars(repo.stars || 0));
    setText('docket-gauge', gaugeFromLanguage(repo.language || 'Unknown'));
    setText('docket-exposure', exposureFromConfidence(repo.confidence || 'low'));
    setText('docket-date', repo.pushedAt || date || 'Unknown');

    // Links
    document.getElementById('docket-github-link').href = repo.url || `https://github.com/${repo.id || ''}`;

    wrap().classList.remove('switching');
    if (onRendered) onRendered();
  }, SWITCH_DELAY_MS);
}

export function renderEmptyEdition(dateStr, skippedCount, onRendered) {
  wrap().classList.add('switching');
  setTimeout(() => {
    setText('docket-tag', `ARCHIVE EDITION · ${dateStr}`);
    document.getElementById('docket-laurel').className = 'verdict-laurel-badge not-fit';
    setText('docket-verdict-text', 'ARCHIVE REST · 0 CANDIDATES');
    setText('docket-title', 'All Repositories Filtered');
    setText('docket-author', 'RepoRadar Engine');
    setText('docket-stars', `${skippedCount || 0} SKIPPED / UNCHANGED`);
    setText('docket-quote',
      `“On ${dateStr}, all scanned trending repositories were either previously evaluated or filtered by domain criteria. No new candidate records met the threshold for pressing.”`);
    const ucSection = document.getElementById('docket-use-cases');
    if (ucSection) ucSection.hidden = true;
    setText('docket-iso', 'ISO 25 · REST SLATE');
    setText('docket-gauge', 'Contact Sheet · Standby');
    setText('docket-exposure', '±0 EV · BALANCED READ');
    setText('docket-date', dateStr);
    document.getElementById('docket-github-link').href = 'https://github.com/trending';
    wrap().classList.remove('switching');
    if (onRendered) onRendered();
  }, SWITCH_DELAY_MS);
}

const USE_CASE_EFFORT = { hour: '~1 HOUR', weekend: 'WEEKEND', project: 'PROJECT' };

function renderUseCases(repo) {
  const section = document.getElementById('docket-use-cases');
  const list = document.getElementById('docket-use-case-list');
  if (!section || !list) return;
  list.textContent = '';
  const cases = Array.isArray(repo && repo.useCases) ? repo.useCases.slice(0, 2) : [];
  const note = (repo && typeof repo.useCaseNote === 'string') ? repo.useCaseNote.trim() : '';
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  if (cases.length === 0) {
    if (!note) { section.hidden = true; return; }
    list.appendChild(el('p', 'use-case-none', 'No strong use case — ' + note));
    section.hidden = false;
    return;
  }
  cases.forEach(uc => {
    const card = el('article', 'use-case-card');
    card.appendChild(el('h4', 'use-case-title', uc.title || 'Untitled'));
    const pills = el('div', 'use-case-pills');
    pills.appendChild(el('span', 'use-case-pill kind', String(uc.kind || '').toUpperCase()));
    pills.appendChild(el('span', 'use-case-pill effort', USE_CASE_EFFORT[uc.effort] || String(uc.effort || '').toUpperCase()));
    if (uc.focus) pills.appendChild(el('span', 'use-case-focus', uc.focus));
    card.appendChild(pills);
    card.appendChild(el('p', 'use-case-pitch', uc.pitch || ''));
    const det = el('details', 'use-case-step');
    const sum = el('summary');
    sum.innerHTML = '<svg aria-hidden="true" width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><path d="M2 1l6 4-6 4z"/></svg>';
    sum.appendChild(document.createTextNode('FIRST STEP'));
    det.appendChild(sum);
    const body = el('p', 'use-case-step-body');
    String(uc.firstStep || '').split(/(`[^`]+`)/).forEach(part => {
      if (!part) return;
      if (part.length > 2 && part[0] === '`' && part[part.length - 1] === '`') {
        body.appendChild(el('code', null, part.slice(1, -1)));
      } else {
        body.appendChild(document.createTextNode(part));
      }
    });
    det.appendChild(body);
    card.appendChild(det);
    list.appendChild(card);
  });
  section.hidden = false;
}
