import { initScene, getDiscs, buildDiscs, disposeDiscs, focusDisc, settleDiscs, pickDiscIndex, setDragging, dragFeedback, releaseBrokenDisc, exitEdition, enterEdition } from './scene.js';
import { getBrokenDisc, isBrokenDiscVisible } from './broken-disc.js';
import { initEditions, getActiveDate, getActiveRepos, getDigest, canSwitchTo, setActiveEdition, adjacentDate } from './editions.js';
import { renderRepo, renderEmptyEdition } from './docket.js';
import { renderFilmstrip, setActiveFrame } from './filmstrip.js';
import { initTracklist, renderTracklist, updateTracklistActive, openTracklist, closeTracklist, toggleTracklist, isTracklistOpen, resetTracklist, refocusIfOpen, handleTracklistKeyDown } from './tracklist.js';


  // ─── Accessibility & Media Preferences ───
  let a11yTimer = null;
  function announceA11y(msg) {
    const announcer = document.getElementById('a11y-announcer');
    if (announcer) {
      if (a11yTimer) clearTimeout(a11yTimer);
      announcer.textContent = '';
      a11yTimer = setTimeout(() => {
        announcer.textContent = msg;
        a11yTimer = null;
      }, 40);
    }
  }

  const systemDarkQuery = window.matchMedia('(prefers-color-scheme: dark)');

  // ─── Data Ingestion & State ───
  let currentIndex = 0;
  let isDragging = false;
  let startX = 0;
  let dragDelta = 0;
  let isSwitchingDate = false;

  await initEditions();
  let repos = getActiveRepos();

  const container = document.getElementById('three-canvas-container');
  const scrubberContainer = document.getElementById('scrubber-container');

  // ─── Header Statistics Dynamic Binding ───
  function updateHeaderStats(digest) {
    const stats = digest?.stats || (repos.length > 0 ? {
      fit: repos.filter(r => r.verdict === 'fit').length,
      maybe: repos.filter(r => r.verdict === 'maybe').length,
      notFit: repos.filter(r => r.verdict === 'not-fit').length,
      total: repos.length
    } : { fit: 0, maybe: 0, notFit: 0, total: 0 });

    const fitEl = document.getElementById('stat-fit-count');
    const maybeEl = document.getElementById('stat-maybe-count');
    const notFitEl = document.getElementById('stat-not-fit-count');
    if (fitEl) fitEl.textContent = stats.fit ?? 0;
    if (maybeEl) maybeEl.textContent = stats.maybe ?? 0;
    if (notFitEl) notFitEl.textContent = stats.notFit ?? 0;

    // Synchronize Tracklist Filter Pill counts
    const pillAll = document.getElementById('pill-count-all');
    const pillFit = document.getElementById('pill-count-fit');
    const pillMaybe = document.getElementById('pill-count-maybe');
    const pillNotFit = document.getElementById('pill-count-not-fit');
    if (pillAll) pillAll.textContent = stats.total ?? repos.length;
    if (pillFit) pillFit.textContent = stats.fit ?? 0;
    if (pillMaybe) pillMaybe.textContent = stats.maybe ?? 0;
    if (pillNotFit) pillNotFit.textContent = stats.notFit ?? 0;
  }

  // ─── Update Docket & Telemetry (Empty State Resilient) ───

  function updateDocket(index) {
    if (!repos || repos.length === 0) {
      const dateStr = getActiveDate();
      const skipped = getDigest(dateStr) ? getDigest(dateStr).skippedCount : 0;
      renderEmptyEdition(dateStr, skipped, () => {
        updateScrubber(0);
        announceA11y(`Archive edition ${dateStr}. 0 candidates for pressing.`);
      });
      return;
    }
    const repo = repos[index];
    if (!repo) return;

    renderRepo(repo, { index, total: repos.length, date: getActiveDate() }, () => {
      updateScrubber(index);
      announceA11y(`Showing repository ${index + 1} of ${repos.length}: ${repo.name} by ${repo.owner}. Verdict: ${repo.verdictLabel || repo.verdict}`);
    });
  }

  function initScrubber() {
    scrubberContainer.innerHTML = '';
    const prevBtn = document.getElementById('prev-disc-btn');
    const nextBtn = document.getElementById('next-disc-btn');

    if (!repos || repos.length === 0) {
      const emptyLabel = document.createElement('span');
      emptyLabel.className = 'scrubber-empty-label';
      emptyLabel.textContent = 'NO DISCS IN EDITION';
      scrubberContainer.appendChild(emptyLabel);
      if (prevBtn) { prevBtn.style.opacity = '0.35'; prevBtn.style.cursor = 'default'; }
      if (nextBtn) { nextBtn.style.opacity = '0.35'; nextBtn.style.cursor = 'default'; }
      return;
    }

    if (prevBtn) { prevBtn.style.opacity = '1'; prevBtn.style.cursor = 'pointer'; }
    if (nextBtn) { nextBtn.style.opacity = '1'; nextBtn.style.cursor = 'pointer'; }

    repos.forEach((_, i) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = `scrubber-dot ${i === currentIndex ? 'active' : ''}`;
      dot.setAttribute('aria-label', `Navigate to disc ${i + 1}`);
      dot.addEventListener('click', () => navigateTo(i));
      scrubberContainer.appendChild(dot);
    });
  }

  function updateScrubber(index) {
    const dots = scrubberContainer.querySelectorAll('.scrubber-dot');
    dots.forEach((dot, i) => {
      dot.classList.toggle('active', i === index);
    });
  }

  function navigateTo(index) {
    if (!repos || repos.length === 0) return;
    if (index < 0 || index >= repos.length || index === currentIndex) return;
    currentIndex = index;
    focusDisc(currentIndex, true);
    updateDocket(currentIndex);
    updateRadarBridge();
    updateTracklistActive(currentIndex);
  }

  // ─── 3D Turntable Dataset Swapping Choreography ───

  function switchEdition(newDate) {
    if (isSwitchingDate || !canSwitchTo(newDate)) return;
    isSwitchingDate = true;

    setActiveFrame(newDate);

    const performMount = () => {
      disposeDiscs();
      const digest = setActiveEdition(newDate);
      repos = getActiveRepos();
      currentIndex = 0;

      // Reset tracklist search and filters so new edition is cleanly displayed
      resetTracklist();

      updateHeaderStats(digest);
      buildDiscs(repos, getActiveDate());
      initScrubber();
      updateDocket(0);
      updateRadarBridge();
      renderTracklist();
      updateTracklistActive(0);

      refocusIfOpen();

      enterEdition();

      isSwitchingDate = false;
    };

    exitEdition(performMount);
  }

  // ─── Global Bridge for External Verification ───
  function updateRadarBridge() {
    window.__RADAR = {
      discs: getDiscs(),
      brokenDisc: getBrokenDisc(),
      activeIndex: currentIndex,
      activeDate: getActiveDate(),
      switchDate: switchEdition,
      openTracklist,
      closeTracklist,
      toggleTracklist,
      isTracklistOpen
    };
  }

  // ─── Interaction Handlers ───

  function handleKeyDown(e) {
    if (handleTracklistKeyDown(e)) return;

    if (e.key === '[' || e.key === '{') {
      // Navigate previous edition
      const prevDate = adjacentDate(-1);
      if (prevDate) switchEdition(prevDate);
    } else if (e.key === ']' || e.key === '}') {
      // Navigate next edition
      const nextDate = adjacentDate(1);
      if (nextDate) switchEdition(nextDate);
    } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
      navigateTo(currentIndex + 1);
    } else if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
      navigateTo(currentIndex - 1);
    }
  }

  let wheelDebounce = false;
  function handleWheel(e) {
    if (repos.length <= 1) return;
    e.preventDefault();
    if (wheelDebounce) return;
    wheelDebounce = true;
    setTimeout(() => wheelDebounce = false, 320);

    if (e.deltaY > 20 || e.deltaX > 20) {
      navigateTo(currentIndex + 1);
    } else if (e.deltaY < -20 || e.deltaX < -20) {
      navigateTo(currentIndex - 1);
    }
  }

  function onPointerDown(e) {
    if (repos.length === 0 && !isBrokenDiscVisible()) return;
    isDragging = true;
    setDragging(true);
    startX = e.clientX || (e.touches && e.touches[0].clientX);
    dragDelta = 0;
  }

  function onPointerMove(e) {
    if (!isDragging) return;
    const curX = e.clientX || (e.touches && e.touches[0].clientX);
    dragDelta = curX - startX;
    
    dragFeedback(dragDelta);
  }

  function onPointerUp(e) {
    if (!isDragging) return;
    isDragging = false;
    setDragging(false);

    releaseBrokenDisc(dragDelta);

    // Click detection (small drag threshold)
    if (Math.abs(dragDelta) < 10 && repos.length > 0) {
      const clientX = e.clientX !== undefined ? e.clientX : (e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].clientX : null);
      const clientY = e.clientY !== undefined ? e.clientY : (e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].clientY : null);

      if (clientX !== null && clientY !== null) {
        const hitIndex = pickDiscIndex(clientX, clientY);
        if (hitIndex !== null) {
          navigateTo(hitIndex);
          return;
        }
      }
    }

    if (repos.length > 1) {
      if (dragDelta < -45) {
        navigateTo(currentIndex + 1);
      } else if (dragDelta > 45) {
        navigateTo(currentIndex - 1);
      } else {
        settleDiscs();
      }
    }
  }

  // ─── Bootstrap ───

  function init() {
    initScene(container);
    buildDiscs(repos, getActiveDate());
    initScrubber();
    renderFilmstrip(switchEdition);
    updateDocket(currentIndex);
    updateHeaderStats(getDigest(getActiveDate()));
    updateRadarBridge();
    initTracklist({
      getActiveIndex: () => currentIndex,
      navigateTo,
      announce: announceA11y,
      onOpenChange: updateRadarBridge
    });
    renderTracklist();
    updateTracklistActive(currentIndex);

    // Navigation Buttons
    document.getElementById('prev-disc-btn').addEventListener('click', () => navigateTo(currentIndex - 1));
    document.getElementById('next-disc-btn').addEventListener('click', () => navigateTo(currentIndex + 1));

    // Copy Clone Link
    const copyBtn = document.getElementById('copy-clone-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        if (!repos || repos.length === 0) return;
        const repo = repos[currentIndex];
        if (!repo) return;
        const cloneUri = `git clone ${repo.url}.git`;

        const notifySuccess = () => {
          copyBtn.textContent = 'COPIED TO CLIPBOARD ✓';
          announceA11y('Repository clone URI copied to clipboard');
          setTimeout(() => { copyBtn.textContent = 'COPY CLONE URI'; }, 2000);
        };

        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(cloneUri)
            .then(notifySuccess)
            .catch(() => fallbackCopy(cloneUri, notifySuccess));
        } else {
          fallbackCopy(cloneUri, notifySuccess);
        }
      });
    }

    function fallbackCopy(text, cb) {
      try {
        const temp = document.createElement('textarea');
        temp.value = text;
        temp.style.position = 'fixed';
        temp.style.opacity = '0';
        document.body.appendChild(temp);
        temp.focus();
        temp.select();
        document.execCommand('copy');
        document.body.removeChild(temp);
        cb();
      } catch (e) {
        console.error('Failed to copy', e);
      }
    }

    // Theme Management
    function getActiveTheme() {
      const explicit = document.documentElement.getAttribute('data-theme');
      if (explicit === 'dark' || explicit === 'light') return explicit;
      return systemDarkQuery.matches ? 'dark' : 'light';
    }

    function applyTheme(theme, save = true) {
      document.documentElement.setAttribute('data-theme', theme);
      const meta = document.querySelector('meta[name="color-scheme"]');
      if (meta) meta.content = theme;
      const themeBtn = document.getElementById('theme-btn');
      if (themeBtn) {
        themeBtn.textContent = theme === 'dark' ? 'INVERT LIGHT' : 'INVERT DARK';
        themeBtn.setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`);
      }
      if (save) {
        try { localStorage.setItem('reporadar-theme', theme); } catch (e) {}
      }
    }

    // Initialize button text & state based on active theme
    const initialTheme = getActiveTheme();
    applyTheme(initialTheme, false);

    const themeBtn = document.getElementById('theme-btn');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        const current = getActiveTheme();
        const next = current === 'dark' ? 'light' : 'dark';
        applyTheme(next, true);
        announceA11y(`Color scheme changed to ${next} mode`);
      });
    }

    // React to system OS color scheme changes if user hasn't explicitly set a preference
    systemDarkQuery.addEventListener('change', (e) => {
      if (!localStorage.getItem('reporadar-theme')) {
        applyTheme(e.matches ? 'dark' : 'light', false);
      }
    });

    // Event listeners
    window.addEventListener('keydown', handleKeyDown);
    container.addEventListener('wheel', handleWheel, { passive: false });
    container.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
