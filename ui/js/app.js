import { initScene, getDiscs, buildDiscs, disposeDiscs, focusDisc, exitEdition, enterEdition } from './scene.js';
import { getBrokenDisc } from './broken-disc.js';
import { initEditions, getActiveDate, getActiveRepos, getDigest, canSwitchTo, setActiveEdition, editionSummary } from './editions.js';
import { renderRepo, renderEmptyEdition } from './docket.js';
import { renderFilmstrip, setActiveFrame } from './filmstrip.js';
import { initTracklist, renderTracklist, updateTracklistActive, openTracklist, closeTracklist, toggleTracklist, isTracklistOpen, resetTracklist, refocusIfOpen } from './tracklist.js';
import { announce as announceA11y } from './a11y.js';
import { initTheme } from './theme.js';
import { initInput } from './input.js';
import { verdictPresentation } from './specs.js';


  // ─── Data Ingestion & State ───
  let currentIndex = 0;
  let isSwitchingDate = false;

  await initEditions();
  let repos = getActiveRepos();

  const container = document.getElementById('three-canvas-container');
  const scrubberContainer = document.getElementById('scrubber-container');

  // ─── Header Statistics Dynamic Binding ───
  function updateHeaderStats() {
    const { stats } = editionSummary(getActiveDate());

    const fitEl = document.getElementById('stat-fit-count');
    const maybeEl = document.getElementById('stat-maybe-count');
    const notFitEl = document.getElementById('stat-not-fit-count');
    if (fitEl) fitEl.textContent = stats.fit;
    if (maybeEl) maybeEl.textContent = stats.maybe;
    if (notFitEl) notFitEl.textContent = stats.notFit;

    // Synchronize Tracklist Filter Pill counts
    const pillAll = document.getElementById('pill-count-all');
    const pillFit = document.getElementById('pill-count-fit');
    const pillMaybe = document.getElementById('pill-count-maybe');
    const pillNotFit = document.getElementById('pill-count-not-fit');
    if (pillAll) pillAll.textContent = stats.total;
    if (pillFit) pillFit.textContent = stats.fit;
    if (pillMaybe) pillMaybe.textContent = stats.maybe;
    if (pillNotFit) pillNotFit.textContent = stats.notFit;
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
      announceA11y(`Showing repository ${index + 1} of ${repos.length}: ${repo.name} by ${repo.owner}. Verdict: ${verdictPresentation(repo).label}`);
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

  // ─── Edition Mount ───

  // Builds everything that shows the active Edition.
  function mountEdition() {
    buildDiscs(repos, getActiveDate());
    initScrubber();
    updateDocket(currentIndex);
    updateHeaderStats();
    updateRadarBridge();
    renderTracklist();
    updateTracklistActive(currentIndex);
  }

  // ─── 3D Turntable Dataset Swapping Choreography ───

  function switchEdition(newDate) {
    if (isSwitchingDate || !canSwitchTo(newDate)) return;
    isSwitchingDate = true;

    setActiveFrame(newDate);

    const performMount = () => {
      disposeDiscs();
      setActiveEdition(newDate);
      repos = getActiveRepos();
      currentIndex = 0;

      // Reset tracklist search and filters so new edition is cleanly displayed
      resetTracklist();

      mountEdition();

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

  // ─── Bootstrap ───

  function init() {
    initScene(container);
    renderFilmstrip(switchEdition);
    initTracklist({
      getActiveIndex: () => currentIndex,
      navigateTo,
      announce: announceA11y,
      onOpenChange: updateRadarBridge
    });
    mountEdition();

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

    initTheme({ announce: announceA11y });

    initInput({
      container,
      getRepoCount: () => repos.length,
      getActiveIndex: () => currentIndex,
      navigateTo,
      switchEdition
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
