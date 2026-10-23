import { createConcentricGroovesTexture, createLabelTexture } from './disc-textures.js';
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
      buildDiscs();
      initScrubber();
      updateDocket(0);
      updateRadarBridge();
      renderTracklist();
      updateTracklistActive(0);

      refocusIfOpen();

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
