import { createConcentricGroovesTexture, createLabelTexture } from './disc-textures.js';
import { initEditions, getActiveDate, getActiveRepos, getDigest, canSwitchTo, setActiveEdition, adjacentDate } from './editions.js';
import { repoCode, escapeHtml, filterRepos } from './specs.js';
import { renderRepo, renderEmptyEdition } from './docket.js';
import { renderFilmstrip, setActiveFrame } from './filmstrip.js';


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

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const systemDarkQuery = window.matchMedia('(prefers-color-scheme: dark)');

  // ─── Data Ingestion & State ───
  let currentIndex = 0;
  let discs = [];
  let brokenDiscGroup = null;
  let brokenLeftMesh = null;
  let brokenRightMesh = null;
  let scene, camera, renderer;
  let isDragging = false;
  let startX = 0;
  let dragDelta = 0;
  let isSwitchingDate = false;
  let isTracklistOpen = false;
  let currentTracklistFilter = 'all';
  let currentTracklistSearch = '';
  let searchAnnounceTimer = null;
  let lastAnnouncedQuery = '';

  await initEditions();
  let repos = getActiveRepos();

  const container = document.getElementById('three-canvas-container');
  const scrubberContainer = document.getElementById('scrubber-container');
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

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

  // ─── 3D Setup: Isolated to Left Stage ───

  function init3D() {
    const width = container.clientWidth;
    const height = container.clientHeight;

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 1000);
    camera.position.set(0, 0, 480);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    container.appendChild(renderer.domElement);

    // Lighting: Dramatic Studio Key & Fill
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xfff7ed, 1.4);
    keyLight.position.set(120, 180, 220);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x93c5fd, 0.8);
    rimLight.position.set(-160, -100, 180);
    scene.add(rimLight);

    const specularLight = new THREE.PointLight(0xffffff, 1.2, 600);
    specularLight.position.set(0, 140, 280);
    scene.add(specularLight);

    initBrokenDisc();
    buildDiscs();
    renderLoop();
  }

  // ─── Broken Disc Architecture (Empty Editions) ───
  function initBrokenDisc() {
    if (brokenDiscGroup) return;
    if (typeof window.REPORADAR_BROKEN_DISC_LEFT === 'undefined' || typeof window.REPORADAR_BROKEN_DISC_RIGHT === 'undefined') {
      return;
    }

    brokenDiscGroup = new THREE.Group();
    brokenDiscGroup.position.set(0, 14, 30);
    brokenDiscGroup.visible = false;

    const DISC_PLANE_SIZE = 256;

    // Left Half
    const leftImg = new Image();
    leftImg.onload = () => {
      const leftTex = new THREE.Texture(leftImg);
      leftTex.needsUpdate = true;
      leftTex.anisotropy = 8;
      const leftGeo = new THREE.PlaneGeometry(DISC_PLANE_SIZE, DISC_PLANE_SIZE);
      const leftMat = new THREE.MeshPhysicalMaterial({
        map: leftTex,
        transparent: true,
        roughness: 0.26,
        metalness: 0.16,
        clearcoat: 0.9,
        clearcoatRoughness: 0.1,
        side: THREE.DoubleSide,
        depthWrite: false
      });
      brokenLeftMesh = new THREE.Mesh(leftGeo, leftMat);
      brokenLeftMesh.position.set(-1.8, 0.6, 0.4);
      brokenLeftMesh.rotation.set(0.015, -0.01, -0.012);
      brokenDiscGroup.add(brokenLeftMesh);

      if (!repos || repos.length === 0) {
        showBrokenDisc(false);
      }
    };
    leftImg.src = window.REPORADAR_BROKEN_DISC_LEFT;

    // Right Half
    const rightImg = new Image();
    rightImg.onload = () => {
      const rightTex = new THREE.Texture(rightImg);
      rightTex.needsUpdate = true;
      rightTex.anisotropy = 8;
      const rightGeo = new THREE.PlaneGeometry(DISC_PLANE_SIZE, DISC_PLANE_SIZE);
      const rightMat = new THREE.MeshPhysicalMaterial({
        map: rightTex,
        transparent: true,
        roughness: 0.26,
        metalness: 0.16,
        clearcoat: 0.9,
        clearcoatRoughness: 0.1,
        side: THREE.DoubleSide,
        depthWrite: false
      });
      brokenRightMesh = new THREE.Mesh(rightGeo, rightMat);
      brokenRightMesh.position.set(1.8, -0.6, -0.4);
      brokenRightMesh.rotation.set(-0.015, 0.01, 0.012);
      brokenDiscGroup.add(brokenRightMesh);

      if (!repos || repos.length === 0) {
        showBrokenDisc(false);
      }
    };
    rightImg.src = window.REPORADAR_BROKEN_DISC_RIGHT;

    scene.add(brokenDiscGroup);
  }

  function showBrokenDisc(animate = true) {
    if (!brokenDiscGroup) return;
    brokenDiscGroup.visible = true;

    if (animate) {
      brokenDiscGroup.position.set(0, -90, 30);
      brokenDiscGroup.scale.set(0.2, 0.2, 0.2);
      brokenDiscGroup.rotation.y = 0.22;

      gsap.to(brokenDiscGroup.position, {
        y: 14,
        duration: 0.65,
        ease: 'power3.out',
        overwrite: 'auto'
      });
      gsap.to(brokenDiscGroup.scale, {
        x: 1,
        y: 1,
        z: 1,
        duration: 0.65,
        ease: 'power3.out',
        overwrite: 'auto'
      });
      gsap.to(brokenDiscGroup.rotation, {
        y: 0,
        duration: 0.65,
        ease: 'power3.out',
        overwrite: 'auto'
      });

      if (brokenLeftMesh && brokenRightMesh) {
        gsap.fromTo(brokenLeftMesh.position,
          { x: -8, y: 3 },
          { x: -1.8, y: 0.6, duration: 0.7, ease: 'back.out(1.4)', overwrite: 'auto' }
        );
        gsap.fromTo(brokenRightMesh.position,
          { x: 8, y: -3 },
          { x: 1.8, y: -0.6, duration: 0.7, ease: 'back.out(1.4)', overwrite: 'auto' }
        );
      }
    } else {
      brokenDiscGroup.position.set(0, 14, 30);
      brokenDiscGroup.scale.set(1, 1, 1);
      brokenDiscGroup.rotation.set(0, 0, 0);
      if (brokenLeftMesh) brokenLeftMesh.position.set(-1.8, 0.6, 0.4);
      if (brokenRightMesh) brokenRightMesh.position.set(1.8, -0.6, -0.4);
    }
  }

  function hideBrokenDisc() {
    if (!brokenDiscGroup) return;
    brokenDiscGroup.visible = false;
  }

  // ─── Memory Safety: WebGL Resource Cleanup Lifecycle ───
  function disposeDiscs() {
    discs.forEach(discGroup => {
      discGroup.traverse(child => {
        if (child.isMesh) {
          if (child.geometry) child.geometry.dispose();
          if (child.material) {
            if (Array.isArray(child.material)) {
              child.material.forEach(m => {
                if (m.map) m.map.dispose();
                m.dispose();
              });
            } else {
              if (child.material.map) child.material.map.dispose();
              child.material.dispose();
            }
          }
        }
      });
      scene.remove(discGroup);
    });
    discs = [];
  }

  function buildDiscs() {
    if (!repos || repos.length === 0) {
      discs = [];
      showBrokenDisc(true);
      return;
    }

    hideBrokenDisc();

    const groovesTex = createConcentricGroovesTexture();
    const DISC_RADIUS = 120;
    const LABEL_RADIUS = 56;
    const INNER_HOLE = 5.5;

    repos.forEach((repo, i) => {
      const discGroup = new THREE.Group();

      // 1. Vinyl Base Disc
      const vinylGeo = new THREE.CylinderGeometry(DISC_RADIUS, DISC_RADIUS, 3, 64);
      const vinylMat = new THREE.MeshPhysicalMaterial({
        color: 0x090a0c,
        roughness: 0.24,
        metalness: 0.16,
        clearcoat: 0.9,
        clearcoatRoughness: 0.1
      });
      const vinylMesh = new THREE.Mesh(vinylGeo, vinylMat);
      vinylMesh.rotation.x = Math.PI / 2;
      discGroup.add(vinylMesh);

      // 2. Grooves Ring Face (with polygonOffset to prevent depth fighting)
      const groovesGeo = new THREE.RingGeometry(LABEL_RADIUS + 0.8, DISC_RADIUS - 1.5, 64);
      const groovesMat = new THREE.MeshPhysicalMaterial({
        map: groovesTex,
        roughness: 0.30,
        metalness: 0.14,
        clearcoat: 0.88,
        side: THREE.FrontSide,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1
      });
      const groovesMesh = new THREE.Mesh(groovesGeo, groovesMat);
      groovesMesh.position.z = 1.75;
      discGroup.add(groovesMesh);

      // 3. Center Paper Label Face
      const labelTex = createLabelTexture(repo, getActiveDate());
      const labelGeo = new THREE.RingGeometry(INNER_HOLE, LABEL_RADIUS, 64);
      const labelMat = new THREE.MeshBasicMaterial({
        map: labelTex,
        side: THREE.FrontSide,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2
      });
      const labelMesh = new THREE.Mesh(labelGeo, labelMat);
      labelMesh.position.z = 1.82;
      discGroup.add(labelMesh);

      // 4. Center Spindle Fine Rim
      const spindleGeo = new THREE.RingGeometry(INNER_HOLE, INNER_HOLE + 1.2, 32);
      const spindleMat = new THREE.MeshStandardMaterial({
        color: 0x18181b,
        metalness: 0.3,
        roughness: 0.6,
        side: THREE.FrontSide,
        polygonOffset: true,
        polygonOffsetFactor: -3,
        polygonOffsetUnits: -3
      });
      const spindleMesh = new THREE.Mesh(spindleGeo, spindleMat);
      spindleMesh.position.z = 1.88;
      discGroup.add(spindleMesh);

      discGroup.userData = { index: i, repo };
      scene.add(discGroup);
      discs.push(discGroup);
    });

    updateDiscPositions(false);
  }

  // ─── Stage Spatial Positioning ───
  function getStageLayout(index, focusIndex) {
    const rel = index - focusIndex;
    const absRel = Math.abs(rel);

    if (absRel === 0) {
      // Active Centerpiece
      return {
        x: 0,
        y: 0,
        z: 30,
        rotY: 0,
        scale: 1.0,
        opacity: 1.0
      };
    }

    // Flanking cards cascaded backwards in Z with inward rotation
    const direction = rel > 0 ? 1 : -1;
    const xSpacing = 115;
    const zStep = -55;

    return {
      x: direction * (xSpacing + (absRel - 1) * 80),
      y: 0,
      z: absRel * zStep,
      rotY: -direction * Math.min(42, 28 + absRel * 5) * (Math.PI / 180),
      scale: Math.max(0.55, 1 - absRel * 0.16),
      opacity: Math.max(0.18, 1 - absRel * 0.32)
    };
  }

  // ─── Visibility Culling: Keep 60 FPS on high-density editions ───
  function updateDiscPositions(animate = true) {
    discs.forEach((disc, i) => {
      const rel = i - currentIndex;
      const absRel = Math.abs(rel);
      const wasVisible = disc.visible;
      disc.visible = (absRel <= 5);

      if (!disc.visible) {
        return;
      }

      const layout = getStageLayout(i, currentIndex);

      if (animate) {
        if (!wasVisible) {
          disc.position.set(layout.x, layout.y, layout.z);
          disc.scale.set(0.1, 0.1, 0.1);
        }
        const animDuration = prefersReducedMotion.matches ? 0.001 : 0.7;
        gsap.to(disc.position, {
          x: layout.x,
          y: layout.y,
          z: layout.z,
          duration: animDuration,
          ease: 'power3.out',
          overwrite: 'auto'
        });
        gsap.to(disc.rotation, {
          y: layout.rotY,
          duration: animDuration,
          ease: 'power3.out',
          overwrite: 'auto'
        });
        gsap.to(disc.scale, {
          x: layout.scale,
          y: layout.scale,
          z: layout.scale,
          duration: animDuration,
          ease: 'power3.out',
          overwrite: 'auto'
        });
      } else {
        disc.position.set(layout.x, layout.y, layout.z);
        disc.rotation.y = layout.rotY;
        disc.scale.set(layout.scale, layout.scale, layout.scale);
      }
    });
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
    updateDiscPositions(true);
    updateDocket(currentIndex);
    updateRadarBridge();
    updateTracklistActive(currentIndex);
  }

  // ─── Gatefold Liner Tracklist Component ───

  function openTracklist() {
    if (isTracklistOpen) return;
    isTracklistOpen = true;
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
    updateRadarBridge();
  }

  function closeTracklist() {
    if (!isTracklistOpen) return;
    isTracklistOpen = false;
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
    updateRadarBridge();
  }

  function toggleTracklist() {
    if (isTracklistOpen) {
      closeTracklist();
    } else {
      openTracklist();
    }
  }

  function updateFilterPillsUI() {
    const pills = document.querySelectorAll('.tracklist-filter-pill');
    pills.forEach(pill => {
      const isAct = pill.dataset.verdict === currentTracklistFilter;
      pill.classList.toggle('active', isAct);
      pill.setAttribute('aria-pressed', isAct ? 'true' : 'false');
    });
  }

  function renderTracklist() {
    const body = document.getElementById('tracklist-body');
    if (!body) return;

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

    const query = currentTracklistSearch.toLowerCase().trim();
    const half = Math.ceil(total / 2);

    const filtered = filterRepos(repos, { verdict: currentTracklistFilter, search: currentTracklistSearch })
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
      const activeName = filterNames[currentTracklistFilter] || 'ALL';
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
          <p class="empty-slate-text">No tracks matched "${escapeHtml(currentTracklistSearch)}" in category ${escapeHtml(activeName)}.</p>
          <button type="button" class="empty-slate-reset-btn" id="tracklist-reset-btn">RESET FILTERS</button>
        </div>
      `;
      const resetBtn = document.getElementById('tracklist-reset-btn');
      if (resetBtn) {
        resetBtn.addEventListener('click', () => {
          currentTracklistSearch = '';
          currentTracklistFilter = 'all';
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
      if (!query && currentTracklistFilter === 'all' && item.side !== currentRenderSide) {
        currentRenderSide = item.side;
        const divider = document.createElement('div');
        divider.className = 'tracklist-side-divider';
        divider.setAttribute('aria-hidden', 'true');
        divider.textContent = `SIDE ${currentRenderSide} • 33 ⅓ RPM`;
        body.appendChild(divider);
      }

      const { repo, idx, trackCode } = item;
      const isAct = (idx === currentIndex);
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
    if (!repos || repos.length === 0 || index < 0 || index >= repos.length) return;
    const repo = repos[index];
    const trackCode = repoCode(index, repos.length);
    if (index !== currentIndex) {
      navigateTo(index);
    }
    updateTracklistActive(index);
    announceA11y(`Cued track ${trackCode}: ${repo.name || 'Untitled'} by ${repo.owner || 'Unknown'}`);
  }

  function updateTracklistActive(index) {
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
    if (!isTracklistOpen) return;
    const body = document.getElementById('tracklist-body');
    const activeRow = document.querySelector(`.tracklist-row[data-index="${currentIndex}"]`);
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
      currentTracklistSearch = '';
      currentTracklistFilter = 'all';
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

      updateHeaderStats(digest);
      buildDiscs();
      initScrubber();
      updateDocket(0);
      updateRadarBridge();
      renderTracklist();
      updateTracklistActive(0);

      const drawer = document.getElementById('tracklist-drawer');
      if (isTracklistOpen && drawer) {
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

      if (discs.length > 0) {
        const transDur = prefersReducedMotion.matches ? 0.001 : 0.5;
        discs.forEach((disc, i) => {
          const rel = i - currentIndex;
          const absRel = Math.abs(rel);
          disc.visible = (absRel <= 5);
          if (!disc.visible) return;

          const target = getStageLayout(i, 0);
          disc.position.set(target.x, -120, target.z);
          disc.scale.set(0.1, 0.1, 0.1);
          disc.rotation.y = target.rotY;

          gsap.to(disc.position, {
            y: target.y,
            duration: transDur,
            delay: prefersReducedMotion.matches ? 0 : Math.min(i * 0.03, 0.2),
            ease: 'power3.out'
          });
          gsap.to(disc.scale, {
            x: target.scale,
            y: target.scale,
            z: target.scale,
            duration: transDur,
            delay: prefersReducedMotion.matches ? 0 : Math.min(i * 0.03, 0.2),
            ease: 'power3.out'
          });
        });
      }

      isSwitchingDate = false;
    };

    const exitDur = prefersReducedMotion.matches ? 0.001 : 0.24;
    if (discs.length > 0) {
      const exitTl = gsap.timeline({ onComplete: performMount });
      discs.forEach(disc => {
        if (disc.visible) {
          exitTl.to(disc.position, { y: 90, z: -160, duration: exitDur, ease: 'power2.in' }, 0);
          exitTl.to(disc.scale, { x: 0.2, y: 0.2, z: 0.2, duration: exitDur, ease: 'power2.in' }, 0);
        }
      });
    } else if (brokenDiscGroup && brokenDiscGroup.visible) {
      const exitTl = gsap.timeline({ onComplete: performMount });
      exitTl.to(brokenDiscGroup.position, { y: 90, z: -160, duration: exitDur, ease: 'power2.in' }, 0);
      exitTl.to(brokenDiscGroup.scale, { x: 0.2, y: 0.2, z: 0.2, duration: exitDur, ease: 'power2.in' }, 0);
    } else {
      performMount();
    }
  }

  // ─── Global Bridge for External Verification ───
  function updateRadarBridge() {
    window.__RADAR = {
      discs: discs,
      brokenDisc: brokenDiscGroup,
      activeIndex: currentIndex,
      activeDate: getActiveDate(),
      switchDate: switchEdition,
      openTracklist: openTracklist,
      closeTracklist: closeTracklist,
      toggleTracklist: toggleTracklist,
      isTracklistOpen: () => isTracklistOpen
    };
  }

  // ─── Interaction Handlers ───

  function handleKeyDown(e) {
    // Focus Trap within tracklist drawer overlay
    if (isTracklistOpen && e.key === 'Tab') {
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
              return;
            }
          } else {
            if (document.activeElement === last || !drawer.contains(document.activeElement)) {
              e.preventDefault();
              first.focus();
              return;
            }
          }
        }
      }
    }

    // Search input specific hotkeys
    if (e.target && e.target.id === 'tracklist-search-input') {
      if (e.key === 'Escape') {
        closeTracklist();
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        const closeBtn = document.getElementById('tracklist-close-btn');
        if (closeBtn) closeBtn.focus();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const target = document.querySelector('.tracklist-row') || document.getElementById('tracklist-reset-btn');
        if (target) target.focus();
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const firstRow = document.querySelector('.tracklist-row');
        if (firstRow) firstRow.click();
        return;
      }
      return;
    }

    // Clear search button specific hotkeys
    if (e.target && e.target.id === 'tracklist-clear-search') {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const activePill = document.querySelector('.tracklist-filter-pill.active') || document.querySelector('.tracklist-filter-pill');
        if (activePill) activePill.focus();
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        document.getElementById('tracklist-search-input')?.focus();
        return;
      }
    }

    // Close button specific hotkeys
    if (e.target && e.target.id === 'tracklist-close-btn') {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const searchInput = document.getElementById('tracklist-search-input');
        if (searchInput) searchInput.focus();
        return;
      }
    }

    // Reset button specific hotkeys
    if (e.target && e.target.id === 'tracklist-reset-btn') {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        const activePill = document.querySelector('.tracklist-filter-pill.active') || document.querySelector('.tracklist-filter-pill');
        if (activePill) activePill.focus();
        else document.getElementById('tracklist-search-input')?.focus();
        return;
      }
    }

    // Generic input handling
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
      if (e.key === 'Escape') {
        closeTracklist();
      }
      return;
    }

    // Hotkey [Escape] to dismiss drawer
    if (e.key === 'Escape') {
      if (isTracklistOpen) {
        closeTracklist();
        return;
      }
    }

    // Ignore single-key shortcuts when modifier keys (Cmd, Ctrl, Alt) are pressed (prevent hijacking native browser shortcuts like Cmd+T, Ctrl+T, Cmd+A, Cmd+D, Cmd+[, Cmd+])
    if (e.metaKey || e.ctrlKey || e.altKey) {
      return;
    }

    // Hotkey [T] to toggle drawer
    if (e.key === 't' || e.key === 'T') {
      toggleTracklist();
      return;
    }

    // Filter pills toolbar arrow navigation
    if (isTracklistOpen && e.target && e.target.classList.contains('tracklist-filter-pill')) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const pills = Array.from(document.querySelectorAll('.tracklist-filter-pill'));
        const cur = pills.indexOf(e.target);
        if (cur !== -1) {
          const next = e.key === 'ArrowRight' ? (cur + 1) % pills.length : (cur - 1 + pills.length) % pills.length;
          pills[next].focus();
        }
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const target = document.querySelector('.tracklist-row') || document.getElementById('tracklist-reset-btn');
        if (target) target.focus();
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        const searchInput = document.getElementById('tracklist-search-input');
        if (searchInput) searchInput.focus();
        return;
      }
    }

    // Track rows vertical arrow navigation
    if (isTracklistOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      const rows = Array.from(document.querySelectorAll('.tracklist-row'));
      if (rows.length > 0) {
        const focusedIdx = rows.findIndex(r => r === document.activeElement);
        if (focusedIdx !== -1) {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            const nextIdx = Math.min(focusedIdx + 1, rows.length - 1);
            rows[nextIdx].focus();
            return;
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (focusedIdx > 0) {
              rows[focusedIdx - 1].focus();
            } else {
              const activePill = document.querySelector('.tracklist-filter-pill.active') || document.querySelector('.tracklist-filter-pill');
              if (activePill) activePill.focus();
              else document.getElementById('tracklist-search-input')?.focus();
            }
            return;
          }
        }
      }
    }

    // Guard: when focus is inside drawer, prevent background turntable arrow navigation
    if (isTracklistOpen && document.activeElement && document.activeElement.closest('#tracklist-drawer')) {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'a' || e.key === 'A' || e.key === 'd' || e.key === 'D') {
        return;
      }
    }

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
    if (repos.length === 0 && (!brokenDiscGroup || !brokenDiscGroup.visible)) return;
    isDragging = true;
    startX = e.clientX || (e.touches && e.touches[0].clientX);
    dragDelta = 0;
  }

  function onPointerMove(e) {
    if (!isDragging) return;
    const curX = e.clientX || (e.touches && e.touches[0].clientX);
    dragDelta = curX - startX;
    
    // Direct drag feedback on active disc rotation
    if (discs[currentIndex]) {
      discs[currentIndex].rotation.y = dragDelta * 0.003;
    } else if (brokenDiscGroup && brokenDiscGroup.visible) {
      brokenDiscGroup.rotation.y = dragDelta * 0.003;
      if (brokenLeftMesh && brokenRightMesh) {
        brokenLeftMesh.position.x = -1.8 - dragDelta * 0.012;
        brokenRightMesh.position.x = 1.8 + dragDelta * 0.012;
      }
    }
  }

  function onPointerUp(e) {
    if (!isDragging) return;
    isDragging = false;

    // Click detection on broken disc (tactile click spring effect)
    if (Math.abs(dragDelta) < 10 && repos.length === 0 && brokenDiscGroup && brokenDiscGroup.visible) {
      if (brokenLeftMesh && brokenRightMesh) {
        gsap.to(brokenLeftMesh.position, { x: -4.5, y: 1.2, duration: 0.12, ease: 'power2.out', yoyo: true, repeat: 1 });
        gsap.to(brokenRightMesh.position, { x: 4.5, y: -1.2, duration: 0.12, ease: 'power2.out', yoyo: true, repeat: 1 });
      }
    }

    if (brokenDiscGroup && brokenDiscGroup.visible) {
      gsap.to(brokenDiscGroup.rotation, { y: 0, duration: 0.6, ease: 'power3.out' });
      if (brokenLeftMesh && brokenRightMesh) {
        gsap.to(brokenLeftMesh.position, { x: -1.8, duration: 0.5, ease: 'back.out(2)' });
        gsap.to(brokenRightMesh.position, { x: 1.8, duration: 0.5, ease: 'back.out(2)' });
      }
    }

    // Click detection (small drag threshold)
    if (Math.abs(dragDelta) < 10 && repos.length > 0) {
      const rect = container.getBoundingClientRect();
      const clientX = e.clientX !== undefined ? e.clientX : (e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].clientX : null);
      const clientY = e.clientY !== undefined ? e.clientY : (e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].clientY : null);
      
      if (clientX !== null && clientY !== null) {
        mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        const hits = raycaster.intersectObjects(scene.children, true);
        if (hits.length > 0) {
          let hit = hits[0].object;
          while (hit && (!hit.userData || hit.userData.index === undefined) && hit.parent) {
            hit = hit.parent;
          }
          if (hit && hit.userData && typeof hit.userData.index === 'number') {
            navigateTo(hit.userData.index);
            return;
          }
        }
      }
    }

    if (repos.length > 1) {
      if (dragDelta < -45) {
        navigateTo(currentIndex + 1);
      } else if (dragDelta > 45) {
        navigateTo(currentIndex - 1);
      } else {
        updateDiscPositions(true);
      }
    }
  }

  function handleResize() {
    const width = container.clientWidth;
    const height = container.clientHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  }

  // ─── Render Loop with Tactile Idle Drift ───

  function renderLoop() {
    requestAnimationFrame(renderLoop);

    // Subtle slow turntable idle spin on the active disc (respects reduced motion preference)
    if (!prefersReducedMotion.matches) {
      if (discs[currentIndex] && !isDragging) {
        discs[currentIndex].rotation.z += 0.0035;
      } else if (brokenDiscGroup && brokenDiscGroup.visible && !isDragging) {
        // Slow atmospheric drift for the broken disc
        brokenDiscGroup.rotation.z += 0.0006;
      }
    }

    renderer.render(scene, camera);
  }

  // ─── Bootstrap ───

  function init() {
    init3D();
    initScrubber();
    renderFilmstrip(switchEdition);
    updateDocket(currentIndex);
    updateHeaderStats(getDigest(getActiveDate()));
    updateRadarBridge();
    renderTracklist();
    updateTracklistActive(currentIndex);

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
        currentTracklistSearch = e.target.value;
        if (clearSearchBtn) {
          clearSearchBtn.style.display = currentTracklistSearch ? 'flex' : 'none';
        }
        renderTracklist();

        clearTimeout(searchAnnounceTimer);
        searchAnnounceTimer = setTimeout(() => {
          const query = currentTracklistSearch.trim();
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
        currentTracklistSearch = '';
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
        currentTracklistFilter = pill.dataset.verdict || 'all';
        updateFilterPillsUI();
        renderTracklist();
        const visibleRows = document.querySelectorAll('.tracklist-row').length;
        const filterLabels = {
          all: 'ALL',
          fit: 'SELECTS',
          maybe: 'REVIEW',
          'not-fit': 'PASS'
        };
        const label = filterLabels[currentTracklistFilter] || currentTracklistFilter.toUpperCase();
        announceA11y(`Filtered by ${label}: ${visibleRows} track${visibleRows === 1 ? '' : 's'} visible.`);
      });
    });

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
    window.addEventListener('resize', handleResize);
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
