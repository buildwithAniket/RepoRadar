// Tracklist: owns the drawer (open/close, focus trap, keyboard navigation), search and Verdict
// filter state, row rendering, the empty states and their announcements. Filtering comes from
// specs.js; the active Edition's Repos from editions.js. The caller supplies, via initTracklist:
//   getActiveIndex() -> index of the Repo cued on the stage
//   navigateTo(index) -> cue a Repo on the stage
//   announce(msg)     -> screen-reader announcement
//   onOpenChange()    -> called after the drawer opens or closes
import { getActiveDate, getActiveRepos } from './editions.js';
import { repoCode, escapeHtml, filterRepos } from './specs.js';

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

let deps = null;
let open = false;
let filter = 'all';
let search = '';
let searchAnnounceTimer = null;
let lastAnnouncedQuery = '';

function announceA11y(msg) {
  deps.announce(msg);
}

export function isTracklistOpen() {
  return open;
}

export function openTracklist() {
  if (open) return;
  open = true;
  const drawer = document.getElementById('tracklist-drawer');
  const toggleBtn = document.getElementById('tracklist-toggle-btn');
  if (drawer) {
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
  }
  if (toggleBtn) {
    toggleBtn.classList.add('active');
    toggleBtn.setAttribute('aria-expanded', 'true');
  }
  const searchInput = document.getElementById('tracklist-search-input');
  if (searchInput) {
    setTimeout(() => searchInput.focus(), 60);
  }
  scrollActiveTrackIntoView();
  announceA11y('Tracklist drawer opened');
  deps.onOpenChange();
}

export function closeTracklist() {
  if (!open) return;
  open = false;
  if (searchAnnounceTimer) {
    clearTimeout(searchAnnounceTimer);
    searchAnnounceTimer = null;
  }
  lastAnnouncedQuery = '';
  const drawer = document.getElementById('tracklist-drawer');
  const toggleBtn = document.getElementById('tracklist-toggle-btn');
  if (drawer) {
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
  }
  if (toggleBtn) {
    toggleBtn.classList.remove('active');
    toggleBtn.setAttribute('aria-expanded', 'false');
    toggleBtn.focus();
  }
  announceA11y('Tracklist drawer closed');
  deps.onOpenChange();
}

export function toggleTracklist() {
  if (open) {
    closeTracklist();
  } else {
    openTracklist();
  }
}

function updateFilterPillsUI() {
  const pills = document.querySelectorAll('.tracklist-filter-pill');
  pills.forEach(pill => {
    const isAct = pill.dataset.verdict === filter;
    pill.classList.toggle('active', isAct);
    pill.setAttribute('aria-pressed', isAct ? 'true' : 'false');
  });
}

export function renderTracklist() {
  const body = document.getElementById('tracklist-body');
  if (!body) return;
  const repos = getActiveRepos();

  const total = repos.length;
  const footerEd = document.getElementById('tracklist-footer-edition');
  const footerStats = document.getElementById('tracklist-footer-stats');
  if (footerEd) footerEd.textContent = `EDITION: ${getActiveDate() || 'UNKNOWN'}`;
  if (footerStats) {
    if (total === 0) {
      footerStats.textContent = '0 TRACKS (REST SLATE)';
    } else if (total === 1) {
      footerStats.textContent = '1 TRACK (SIDE A)';
    } else {
      footerStats.textContent = `${total} TRACKS (SIDE A & B)`;
    }
  }

  body.innerHTML = '';

  if (total === 0) {
    body.innerHTML = `
      <div class="tracklist-empty-slate">
        <div class="empty-slate-icon" aria-hidden="true">
          <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="12" r="10"></circle>
            <polygon points="10 8 16 12 10 16 10 8" fill="currentColor" opacity="0.3"></polygon>
            <line x1="4" y1="4" x2="20" y2="20" stroke="currentColor" stroke-width="1.8"></line>
          </svg>
        </div>
        <h3 class="empty-slate-title">CINEMATIC REST SLATE</h3>
        <p class="empty-slate-text">All candidates in this cycle were filtered or archived during pre-screening. No active discs pressed for this edition.</p>
        <span class="empty-slate-meta">ARCHIVE CYCLE ${escapeHtml(getActiveDate())} • 0 CANDIDATES</span>
      </div>
    `;
    return;
  }

  const query = search.toLowerCase().trim();
  const half = Math.ceil(total / 2);

  const filtered = filterRepos(repos, { verdict: filter, search: search })
    .map(({ repo, idx }) => ({
      repo,
      idx,
      trackCode: repoCode(idx, total),
      side: idx < half ? 'A' : 'B'
    }));

  if (filtered.length === 0) {
    const filterNames = {
      all: 'ARCHIVE',
      fit: 'SELECTS',
      maybe: 'REVIEW',
      'not-fit': 'PASS'
    };
    const activeName = filterNames[filter] || 'ALL';
    body.innerHTML = `
      <div class="tracklist-empty-slate">
        <div class="empty-slate-icon" aria-hidden="true">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            <line x1="8" y1="11" x2="14" y2="11"></line>
          </svg>
        </div>
        <h3 class="empty-slate-title">NO MATCHING TRACKS</h3>
        <p class="empty-slate-text">No tracks matched "${escapeHtml(search)}" in category ${escapeHtml(activeName)}.</p>
        <button type="button" class="empty-slate-reset-btn" id="tracklist-reset-btn">RESET FILTERS</button>
      </div>
    `;
    const resetBtn = document.getElementById('tracklist-reset-btn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        search = '';
        filter = 'all';
        if (searchAnnounceTimer) {
          clearTimeout(searchAnnounceTimer);
          searchAnnounceTimer = null;
        }
        lastAnnouncedQuery = '';
        const searchInput = document.getElementById('tracklist-search-input');
        if (searchInput) {
          searchInput.value = '';
          searchInput.focus();
        }
        const clearBtn = document.getElementById('tracklist-clear-search');
        if (clearBtn) clearBtn.style.display = 'none';
        updateFilterPillsUI();
        renderTracklist();
        announceA11y('Filters reset. Showing all tracks.');
      });
    }
    return;
  }

  let currentRenderSide = null;

  filtered.forEach(item => {
    if (!query && filter === 'all' && item.side !== currentRenderSide) {
      currentRenderSide = item.side;
      const divider = document.createElement('div');
      divider.className = 'tracklist-side-divider';
      divider.setAttribute('aria-hidden', 'true');
      divider.textContent = `SIDE ${currentRenderSide} • 33 ⅓ RPM`;
      body.appendChild(divider);
    }

    const { repo, idx, trackCode } = item;
    const isAct = (idx === deps.getActiveIndex());
    const verdict = repo.verdict || 'not-fit';
    const verdictLabel = repo.verdictLabel || (verdict === 'fit' ? 'OFFICIAL SELECTION' : (verdict === 'maybe' ? 'UNDER REVIEW' : 'ARCHIVED / PASS'));

    let badgeIconSvg = '';
    if (verdict === 'fit') {
      badgeIconSvg = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 2l2.4 7.4h7.6l-6.2 4.5 2.4 7.4-6.2-4.5-6.2 4.5 2.4-7.4-6.2-4.5h7.6z"/></svg>';
    } else if (verdict === 'maybe') {
      badgeIconSvg = '<svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/></svg>';
    } else {
      badgeIconSvg = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
    }

    const row = document.createElement('button');
    row.type = 'button';
    row.className = `tracklist-row ${isAct ? 'active' : ''}`;
    row.dataset.index = idx;
    row.setAttribute('role', 'listitem');
    row.setAttribute('aria-current', isAct ? 'true' : 'false');
    row.setAttribute('aria-label', `Track ${trackCode}: ${repo.name || 'Untitled'} by ${repo.owner || 'Unknown'}, ${repo.language || 'Unknown'}, ${(repo.stars || 0).toLocaleString()} stars, verdict ${verdictLabel}${repo.useCases && repo.useCases.length ? `, ${repo.useCases.length} use-case suggestion${repo.useCases.length === 1 ? '' : 's'}` : ''}`);

    row.innerHTML = `
      <div class="track-side-col">
        <span class="track-code">${escapeHtml(trackCode)}</span>
      </div>
      <div class="track-verdict-col">
        <div class="track-verdict-badge ${escapeHtml(verdict)}" title="${escapeHtml(verdictLabel)}">
          ${badgeIconSvg}
        </div>
      </div>
      <div class="track-info-col">
        <div class="track-name-row">
          <span class="track-name">${escapeHtml(repo.name || 'Untitled')}</span>
          ${(repo.useCases && repo.useCases.length > 0) ? `<span class="track-usecase-badge" role="img" aria-label="${repo.useCases.length} use-case suggestion${repo.useCases.length === 1 ? '' : 's'}"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z"/></svg><span aria-hidden="true">${repo.useCases.length}</span></span>` : ''}
          ${isAct ? '<span class="cued-indicator" aria-label="Currently cued"><span class="eq-bar"></span><span class="eq-bar"></span><span class="eq-bar"></span></span>' : ''}
        </div>
        <div class="track-meta-row">
          <span class="track-studio">${escapeHtml(repo.owner || 'UNKNOWN')}</span>
          <span class="track-meta-dot">•</span>
          <span class="track-lang">${escapeHtml(repo.language || 'Unknown')}</span>
          <span class="track-meta-dot">•</span>
          <span class="track-stars">★ ${(repo.stars || 0).toLocaleString()}</span>
        </div>
      </div>
      <div class="track-action-col" aria-hidden="true">
        <span class="track-cue-hint">${isAct ? 'CUED' : 'CUE ➔'}</span>
      </div>
    `;

    row.addEventListener('click', () => {
      cueTrack(idx);
    });

    body.appendChild(row);
  });
}

function cueTrack(index) {
  const repos = getActiveRepos();
  if (!repos || repos.length === 0 || index < 0 || index >= repos.length) return;
  const repo = repos[index];
  const trackCode = repoCode(index, repos.length);
  if (index !== deps.getActiveIndex()) {
    deps.navigateTo(index);
  }
  updateTracklistActive(index);
  announceA11y(`Cued track ${trackCode}: ${repo.name || 'Untitled'} by ${repo.owner || 'Unknown'}`);
}

export function updateTracklistActive(index) {
  const rows = document.querySelectorAll('.tracklist-row');
  rows.forEach(row => {
    const rowIdx = parseInt(row.dataset.index, 10);
    const isAct = (rowIdx === index);
    row.classList.toggle('active', isAct);
    row.setAttribute('aria-current', isAct ? 'true' : 'false');

    const nameRow = row.querySelector('.track-name-row');
    const existingEq = row.querySelector('.cued-indicator');
    const hint = row.querySelector('.track-cue-hint');

    if (isAct) {
      if (!existingEq && nameRow) {
        const ind = document.createElement('span');
        ind.className = 'cued-indicator';
        ind.setAttribute('aria-label', 'Currently cued');
        ind.innerHTML = '<span class="eq-bar"></span><span class="eq-bar"></span><span class="eq-bar"></span>';
        nameRow.appendChild(ind);
      }
      if (hint) hint.textContent = 'CUED';
    } else {
      if (existingEq) existingEq.remove();
      if (hint) hint.textContent = 'CUE ➔';
    }
  });

  scrollActiveTrackIntoView();
}

function scrollActiveTrackIntoView() {
  if (!open) return;
  const body = document.getElementById('tracklist-body');
  const activeRow = document.querySelector(`.tracklist-row[data-index="${deps.getActiveIndex()}"]`);
  if (body && activeRow) {
    const rowTop = activeRow.offsetTop;
    const rowBottom = rowTop + activeRow.offsetHeight;
    const bodyTop = body.scrollTop;
    const bodyBottom = bodyTop + body.clientHeight;
    if (rowTop < bodyTop) {
      body.scrollTo({ top: Math.max(0, rowTop - 12), behavior: prefersReducedMotion.matches ? 'auto' : 'smooth' });
    } else if (rowBottom > bodyBottom) {
      body.scrollTo({ top: rowBottom - body.clientHeight + 12, behavior: prefersReducedMotion.matches ? 'auto' : 'smooth' });
    }
  }
}

export function initTracklist(config) {
  deps = config;

  // Tracklist Overlay Event Listeners
  const tracklistToggleBtn = document.getElementById('tracklist-toggle-btn');
  if (tracklistToggleBtn) {
    tracklistToggleBtn.addEventListener('click', toggleTracklist);
  }

  const tracklistCloseBtn = document.getElementById('tracklist-close-btn');
  if (tracklistCloseBtn) {
    tracklistCloseBtn.addEventListener('click', closeTracklist);
  }

  const searchInput = document.getElementById('tracklist-search-input');
  const clearSearchBtn = document.getElementById('tracklist-clear-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      search = e.target.value;
      if (clearSearchBtn) {
        clearSearchBtn.style.display = search ? 'flex' : 'none';
      }
      renderTracklist();

      clearTimeout(searchAnnounceTimer);
      searchAnnounceTimer = setTimeout(() => {
        const query = search.trim();
        if (query) {
          lastAnnouncedQuery = query;
          const visibleRows = document.querySelectorAll('.tracklist-row').length;
          if (visibleRows === 0) {
            announceA11y(`No tracks matching "${query}".`);
          } else {
            announceA11y(`${visibleRows} track${visibleRows === 1 ? '' : 's'} matching "${query}".`);
          }
        } else if (lastAnnouncedQuery) {
          lastAnnouncedQuery = '';
          const visibleRows = document.querySelectorAll('.tracklist-row').length;
          announceA11y(`Search cleared. Showing ${visibleRows} tracks.`);
        }
      }, 350);
    });
  }

  if (clearSearchBtn) {
    clearSearchBtn.addEventListener('click', () => {
      if (searchInput) {
        searchInput.value = '';
        searchInput.focus();
      }
      search = '';
      clearTimeout(searchAnnounceTimer);
      searchAnnounceTimer = null;
      lastAnnouncedQuery = '';
      clearSearchBtn.style.display = 'none';
      renderTracklist();
      announceA11y('Search cleared. Showing all tracks.');
    });
  }

  const filterPills = document.querySelectorAll('.tracklist-filter-pill');
  filterPills.forEach(pill => {
    pill.addEventListener('click', () => {
      filter = pill.dataset.verdict || 'all';
      updateFilterPillsUI();
      renderTracklist();
      const visibleRows = document.querySelectorAll('.tracklist-row').length;
      const filterLabels = {
        all: 'ALL',
        fit: 'SELECTS',
        maybe: 'REVIEW',
        'not-fit': 'PASS'
      };
      const label = filterLabels[filter] || filter.toUpperCase();
      announceA11y(`Filtered by ${label}: ${visibleRows} track${visibleRows === 1 ? '' : 's'} visible.`);
    });
  });

}

// Clears search and filter, as when a new Edition is mounted.
export function resetTracklist() {
  search = '';
  filter = 'all';
  if (searchAnnounceTimer) {
    clearTimeout(searchAnnounceTimer);
    searchAnnounceTimer = null;
  }
  lastAnnouncedQuery = '';
  const searchInput = document.getElementById('tracklist-search-input');
  if (searchInput) searchInput.value = '';
  const clearBtn = document.getElementById('tracklist-clear-search');
  if (clearBtn) clearBtn.style.display = 'none';
  updateFilterPillsUI();
}

// After an Edition switch with the drawer open, move focus into the list if it was lost.
export function refocusIfOpen() {
  const drawer = document.getElementById('tracklist-drawer');
  if (open && drawer) {
    if (!document.activeElement || document.activeElement === document.body || drawer.contains(document.activeElement)) {
      const firstRow = document.querySelector('.tracklist-row');
      if (firstRow) {
        firstRow.focus();
      } else {
        const searchInput = document.getElementById('tracklist-search-input');
        if (searchInput) searchInput.focus();
      }
    }
  }
}

// Handles Tracklist keyboard behavior: focus trap, in-drawer arrow navigation, Escape and the
// T toggle. Returns true when the key was consumed and the caller must not act on it.
export function handleTracklistKeyDown(e) {
  // Focus Trap within tracklist drawer overlay
  if (open && e.key === 'Tab') {
    const drawer = document.getElementById('tracklist-drawer');
    if (drawer) {
      const focusables = Array.from(drawer.querySelectorAll('button:not([disabled]), input:not([disabled])'))
        .filter(el => el.offsetParent !== null && window.getComputedStyle(el).display !== 'none');
      if (focusables.length > 0) {
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first || !drawer.contains(document.activeElement)) {
            e.preventDefault();
            last.focus();
            return true;
          }
        } else {
          if (document.activeElement === last || !drawer.contains(document.activeElement)) {
            e.preventDefault();
            first.focus();
            return true;
          }
        }
      }
    }
  }

  // Search input specific hotkeys
  if (e.target && e.target.id === 'tracklist-search-input') {
    if (e.key === 'Escape') {
      closeTracklist();
      return true;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const closeBtn = document.getElementById('tracklist-close-btn');
      if (closeBtn) closeBtn.focus();
      return true;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const target = document.querySelector('.tracklist-row') || document.getElementById('tracklist-reset-btn');
      if (target) target.focus();
      return true;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const firstRow = document.querySelector('.tracklist-row');
      if (firstRow) firstRow.click();
      return true;
    }
    return true;
  }

  // Clear search button specific hotkeys
  if (e.target && e.target.id === 'tracklist-clear-search') {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const activePill = document.querySelector('.tracklist-filter-pill.active') || document.querySelector('.tracklist-filter-pill');
      if (activePill) activePill.focus();
      return true;
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      document.getElementById('tracklist-search-input')?.focus();
      return true;
    }
  }

  // Close button specific hotkeys
  if (e.target && e.target.id === 'tracklist-close-btn') {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const searchInput = document.getElementById('tracklist-search-input');
      if (searchInput) searchInput.focus();
      return true;
    }
  }

  // Reset button specific hotkeys
  if (e.target && e.target.id === 'tracklist-reset-btn') {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const activePill = document.querySelector('.tracklist-filter-pill.active') || document.querySelector('.tracklist-filter-pill');
      if (activePill) activePill.focus();
      else document.getElementById('tracklist-search-input')?.focus();
      return true;
    }
  }

  // Generic input handling
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
    if (e.key === 'Escape') {
      closeTracklist();
    }
    return true;
  }

  // Hotkey [Escape] to dismiss drawer
  if (e.key === 'Escape') {
    if (open) {
      closeTracklist();
      return true;
    }
  }

  // Ignore single-key shortcuts when modifier keys (Cmd, Ctrl, Alt) are pressed (prevent hijacking native browser shortcuts like Cmd+T, Ctrl+T, Cmd+A, Cmd+D, Cmd+[, Cmd+])
  if (e.metaKey || e.ctrlKey || e.altKey) {
    return true;
  }

  // Hotkey [T] to toggle drawer
  if (e.key === 't' || e.key === 'T') {
    toggleTracklist();
    return true;
  }

  // Filter pills toolbar arrow navigation
  if (open && e.target && e.target.classList.contains('tracklist-filter-pill')) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const pills = Array.from(document.querySelectorAll('.tracklist-filter-pill'));
      const cur = pills.indexOf(e.target);
      if (cur !== -1) {
        const next = e.key === 'ArrowRight' ? (cur + 1) % pills.length : (cur - 1 + pills.length) % pills.length;
        pills[next].focus();
      }
      return true;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const target = document.querySelector('.tracklist-row') || document.getElementById('tracklist-reset-btn');
      if (target) target.focus();
      return true;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const searchInput = document.getElementById('tracklist-search-input');
      if (searchInput) searchInput.focus();
      return true;
    }
  }

  // Track rows vertical arrow navigation
  if (open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
    const rows = Array.from(document.querySelectorAll('.tracklist-row'));
    if (rows.length > 0) {
      const focusedIdx = rows.findIndex(r => r === document.activeElement);
      if (focusedIdx !== -1) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          const nextIdx = Math.min(focusedIdx + 1, rows.length - 1);
          rows[nextIdx].focus();
          return true;
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          if (focusedIdx > 0) {
            rows[focusedIdx - 1].focus();
          } else {
            const activePill = document.querySelector('.tracklist-filter-pill.active') || document.querySelector('.tracklist-filter-pill');
            if (activePill) activePill.focus();
            else document.getElementById('tracklist-search-input')?.focus();
          }
          return true;
        }
      }
    }
  }

  // Guard: when focus is inside drawer, prevent background turntable arrow navigation
  if (open && document.activeElement && document.activeElement.closest('#tracklist-drawer')) {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'a' || e.key === 'A' || e.key === 'd' || e.key === 'D') {
      return true;
    }
  }

  return false;
}
