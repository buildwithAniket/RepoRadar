import { isoFromStars, gaugeFromLanguage, exposureFromConfidence, repoCode, escapeHtml, filterRepos } from './specs.js';


  // ─── Fallback Sample Data (If window.REPORADAR_DIGESTS is absent) ───
  const fallbackRepos = [
    {
      id: 'NousResearch/hermes-agent',
      owner: 'NousResearch',
      name: 'hermes-agent',
      stars: 240294,
      language: 'Python',
      pushedAt: '2026-09-02',
      confidence: 'high',
      verdict: 'fit',
      verdictLabel: 'OFFICIAL SELECTION',
      reason: 'As a core interest area, this repository represents a significant advancement in autonomous agent systems that you should monitor for integration into your coding workflows.',
      url: 'https://github.com/NousResearch/hermes-agent'
    },
    {
      id: 'agent-substrate/substrate',
      owner: 'agent-substrate',
      name: 'substrate',
      stars: 2675,
      language: 'TypeScript',
      pushedAt: '2026-09-10',
      confidence: 'high',
      verdict: 'fit',
      verdictLabel: 'OFFICIAL SELECTION',
      reason: 'A high-signal architectural primitive for autonomous agent orchestration. As a core system, it provides the deterministic workflow primitives needed for complex multi-agent execution.',
      url: 'https://github.com/agent-substrate/substrate'
    },
    {
      id: 'JustVugg/colibri',
      owner: 'JustVugg',
      name: 'colibri',
      stars: 32714,
      language: 'C',
      pushedAt: '2026-09-13',
      confidence: 'high',
      verdict: 'fit',
      verdictLabel: 'OFFICIAL SELECTION',
      reason: 'Highly relevant for high-performance local AI orchestration. The zero-dependency C engine for streaming MoE models provides extreme architectural efficiency for running on edge hardware.',
      url: 'https://github.com/JustVugg/colibri'
    },
    {
      id: 'superlinked/sie',
      owner: 'superlinked',
      name: 'sie',
      stars: 3126,
      language: 'Python',
      pushedAt: '2026-09-01',
      confidence: 'high',
      verdict: 'fit',
      verdictLabel: 'OFFICIAL SELECTION',
      reason: 'Provides essential infrastructure for production-grade agent memory and vector orchestration, critical for scaling local/cloud agent runners.',
      url: 'https://github.com/superlinked/sie'
    },
    {
      id: 'google-research/timesfm',
      owner: 'google-research',
      name: 'timesfm',
      stars: 30187,
      language: 'Python',
      pushedAt: '2026-08-30',
      confidence: 'medium',
      verdict: 'maybe',
      verdictLabel: 'UNDER REVIEW',
      reason: 'Relevant if building custom financial portfolio tracking or predictive wealth management tools, but lacks immediate application to core agent coding automation.',
      url: 'https://github.com/google-research/timesfm'
    },
    {
      id: 'anthropics/financial-services',
      owner: 'anthropics',
      name: 'financial-services',
      stars: 36020,
      language: 'TypeScript',
      pushedAt: '2026-09-22',
      confidence: 'medium',
      verdict: 'maybe',
      verdictLabel: 'UNDER REVIEW',
      reason: 'Repository name suggests financial services and wealth compliance utilities. Remains a candidate until verification of financial engineering integration.',
      url: 'https://github.com/anthropics/financial-services'
    },
    {
      id: 'fmtlib/fmt',
      owner: 'fmtlib',
      name: 'fmt',
      stars: 24472,
      language: 'C++',
      pushedAt: '2026-08-27',
      confidence: 'low',
      verdict: 'not-fit',
      verdictLabel: 'ARCHIVED / PASS',
      reason: 'A foundational, high-quality formatting library, but a low-level C++ utility that does not align with high-level AI agent orchestration or career automation.',
      url: 'https://github.com/fmtlib/fmt'
    },
    {
      id: 'sngyai/Sequoia-X',
      owner: 'sngyai',
      name: 'Sequoia-X',
      stars: 6276,
      language: 'Python',
      pushedAt: '2026-09-01',
      confidence: 'low',
      verdict: 'not-fit',
      verdictLabel: 'ARCHIVED / PASS',
      reason: 'A region-specific stock screening tool for the Chinese domestic market, failing alignment with global career-ops or cross-border FinTech systems.',
      url: 'https://github.com/sngyai/Sequoia-X'
    }
  ];

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
  const digestsData = (typeof window !== 'undefined' && window.REPORADAR_DIGESTS) ? window.REPORADAR_DIGESTS : null;
  let availableDates = [];
  let activeDate = null;
  let repos = [];
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
  let filmstripInteractionsBound = false;
  let isTracklistOpen = false;
  let currentTracklistFilter = 'all';
  let currentTracklistSearch = '';
  let searchAnnounceTimer = null;
  let lastAnnouncedQuery = '';

  if (digestsData && Object.keys(digestsData).length > 0) {
    availableDates = Object.keys(digestsData).sort();
    // Requirement 8: Automatically load the latest available report date (e.g. 2026-09-23) by default!
    activeDate = availableDates[availableDates.length - 1];
    const initialDigest = digestsData[activeDate];
    repos = (initialDigest && initialDigest.repos) ? initialDigest.repos : [];
  } else {
    activeDate = '2026-09-02';
    availableDates = [activeDate];
    repos = fallbackRepos;
  }

  const container = document.getElementById('three-canvas-container');
  const scrubberContainer = document.getElementById('scrubber-container');
  const docketWrap = document.getElementById('docket-wrap');
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

  // ─── Pre-load Photographic Vinyl Textures ───
  // Data URIs decode from memory near-instantly; preload at parse time
  const _vinylGroovesImg = new Image();
  if (typeof window.REPORADAR_VINYL_GROOVES !== 'undefined') {
    _vinylGroovesImg.src = window.REPORADAR_VINYL_GROOVES;
  }
  const _vinylFullImg = new Image();
  if (typeof window.REPORADAR_VINYL_FULL !== 'undefined') {
    _vinylFullImg.src = window.REPORADAR_VINYL_FULL;
  }

  function createConcentricGroovesTexture() {
    const size = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const cx = size / 2, cy = size / 2;

    if (_vinylGroovesImg.complete && _vinylGroovesImg.naturalWidth > 0) {
      // Draw the real photographic grooves from the reference image
      ctx.drawImage(_vinylGroovesImg, 0, 0, size, size);
    } else {
      // Fallback: procedural grooves (should rarely happen with data URIs)
      ctx.fillStyle = '#090a0c';
      ctx.fillRect(0, 0, size, size);
      ctx.lineWidth = 1;
      for (let r = 230; r < 502; r += 2.0) {
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        const alpha = 0.035 + Math.sin(r * 0.4) * 0.02 + Math.random() * 0.025;
        ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.stroke();
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = 8;
    return tex;
  }

  function createLabelTexture(repo) {
    const size = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const cx = size / 2, cy = size / 2;

    const verdict = repo.verdict || 'not-fit';
    const verdictColors = {
      fit: { primary: '#1b5e20', border: 'rgba(27, 94, 32, 0.7)', bg: '#f5f3eb', accent: '#2e7d32' },
      maybe: { primary: '#b45309', border: 'rgba(180, 83, 9, 0.7)', bg: '#f6f3ea', accent: '#d97706' },
      'not-fit': { primary: '#52525b', border: 'rgba(82, 82, 91, 0.7)', bg: '#f3f1ec', accent: '#71717a' }
    };
    const vColor = verdictColors[verdict] || verdictColors['not-fit'];

    // ─── LAYER 1: Photographic label from reference image ───
    // Use the FULL vinyl image and clip to label area — this gives us
    // the REAL paper grain, print stipple, border rings, and center hole
    if (_vinylFullImg.complete && _vinylFullImg.naturalWidth > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, 500, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(_vinylFullImg, 0, 0, size, size);
      ctx.restore();

      // Paint over the photo's original text with a cream fill
      // Use a radial gradient: opaque in center (covers old text),
      // transparent at edges (preserves photo border rings & grain)
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, 455, 0, Math.PI * 2);
      ctx.clip();
      const clearGrad = ctx.createRadialGradient(cx, cy, 30, cx, cy, 455);
      clearGrad.addColorStop(0, 'rgba(245, 243, 236, 0.92)');
      clearGrad.addColorStop(0.65, 'rgba(245, 243, 236, 0.88)');
      clearGrad.addColorStop(0.88, 'rgba(245, 243, 236, 0.6)');
      clearGrad.addColorStop(1.0, 'rgba(245, 243, 236, 0.0)');
      ctx.fillStyle = clearGrad;
      ctx.fillRect(0, 0, size, size);
      ctx.restore();

      // Re-draw the spindle hole (was covered by the cream fill)
      ctx.beginPath();
      ctx.arc(cx, cy, 24, 0, Math.PI * 2);
      ctx.fillStyle = '#090a0c';
      ctx.fill();

      // Overlay a subtle tinted wash for verdict color variation
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, 450, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = vColor.bg;
      ctx.globalAlpha = 0.12;
      ctx.fillRect(0, 0, size, size);
      ctx.restore();
    } else {
      // Fallback: procedural label background
      const radGrad = ctx.createRadialGradient(cx, cy, 50, cx, cy, 500);
      radGrad.addColorStop(0, '#f9f8f4');
      radGrad.addColorStop(0.7, vColor.bg);
      radGrad.addColorStop(1, '#ece7dc');
      ctx.beginPath();
      ctx.arc(cx, cy, 500, 0, Math.PI * 2);
      ctx.fillStyle = radGrad;
      ctx.fill();

      // Stipple grain
      ctx.fillStyle = 'rgba(0, 0, 0, 0.015)';
      for (let i = 0; i < 2800; i++) {
        const rx = cx + (Math.random() - 0.5) * 980;
        const ry = cy + (Math.random() - 0.5) * 980;
        if (Math.hypot(rx - cx, ry - cy) < 490) {
          ctx.fillRect(rx, ry, 1.2, 1.2);
        }
      }

      // Border rings
      ctx.beginPath(); ctx.arc(cx, cy, 492, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.08)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, 474, 0, Math.PI * 2);
      ctx.strokeStyle = '#27272a'; ctx.lineWidth = 2.4; ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, 460, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(39, 39, 42, 0.7)'; ctx.lineWidth = 1.2; ctx.stroke();

      // Spindle area
      ctx.beginPath(); ctx.arc(cx, cy, 148, 0, Math.PI * 2);
      ctx.fillStyle = '#faf9f5'; ctx.fill();
      ctx.beginPath(); ctx.arc(cx, cy, 148, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.12)'; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, 24, 0, Math.PI * 2);
      ctx.fillStyle = '#090a0c'; ctx.fill();
    }

    // ─── LAYER 2: Dynamic text overlay (same layout, now on real photo base) ───
    ctx.globalAlpha = 1.0;

    // TOP BANNER: "LIMITED EDITION" — tracking-spaced
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 38px "Inter", -apple-system, sans-serif';
    ctx.fillStyle = '#111313';
    
    const bannerText = 'LIMITED EDITION';
    const bChars = bannerText.split('');
    const bTotalW = 460;
    const bStep = bTotalW / (bChars.length - 1);
    const bStartX = cx - bTotalW / 2;
    for (let i = 0; i < bChars.length; i++) {
      ctx.fillText(bChars[i], bStartX + i * bStep, 175);
    }

    // STUDIO HEADER
    const ownerStr = (repo.owner || 'UNKNOWN').toUpperCase();
    ctx.font = '600 16px "JetBrains Mono", monospace';
    ctx.fillStyle = '#891a20';
    ctx.fillText(`STUDIO: ${ownerStr}`, cx, 230);

    // Repository Display Name
    const repoName = repo.name || 'Untitled';
    let fontSize = 48;
    ctx.font = `700 ${fontSize}px "Playfair Display", Georgia, serif`;
    while (ctx.measureText(repoName).width > 560 && fontSize > 26) {
      fontSize -= 3;
      ctx.font = `700 ${fontSize}px "Playfair Display", Georgia, serif`;
    }
    ctx.fillStyle = '#18181b';
    ctx.fillText(repoName, cx, 280);

    // FLANKING EDITORIAL COLUMNS (Left and Right of Spindle Hole)
    ctx.textAlign = 'left';
    ctx.font = '600 15px "JetBrains Mono", monospace';
    ctx.fillStyle = '#3f3f46';
    const lx = cx - 355;
    const ly = cy - 36;
    ctx.fillText(`★ ${(repo.stars || 0).toLocaleString()} STARS`, lx, ly);
    ctx.fillText(`LANG · ${(repo.language || 'UNKNOWN').toUpperCase()}`, lx, ly + 25);
    const expStr = repo.confidence === 'high' ? '+1 EV HIGH' : (repo.confidence === 'medium' ? '±0 EV READ' : '-1 EV LOW');
    ctx.fillText(`EXP · ${expStr}`, lx, ly + 50);
    ctx.fillText(`STATUS · ${(repo.classification || 'ACTIVE').toUpperCase()}`, lx, ly + 75);

    const rx = cx + 175;
    const ry = cy - 36;
    const catCode = `RR-${String(repo.name || '001').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7)}`;
    ctx.fillText(`CAT NO · ${catCode}`, rx, ry);
    ctx.fillText(`GAUGE · 35MM CELLULOID`, rx, ry + 25);
    ctx.fillText(`PUSH · ${repo.pushedAt || activeDate || '2026'}`, rx, ry + 50);
    ctx.fillText(`RPM · 33 ⅓ STEREO`, rx, ry + 75);

    // VERDICT MEDALLION
    ctx.textAlign = 'center';
    const my = cy + 160;
    ctx.beginPath();
    ctx.arc(cx, my, 28, 0, Math.PI * 2);
    ctx.fillStyle = '#18181b';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, my, 28, 0, Math.PI * 2);
    ctx.strokeStyle = vColor.border;
    ctx.lineWidth = 1.8;
    ctx.stroke();

    ctx.font = '700 20px "JetBrains Mono", monospace';
    ctx.fillStyle = verdict === 'fit' ? '#4ade80' : (verdict === 'maybe' ? '#fbbf24' : '#d4d4d8');
    const icon = verdict === 'fit' ? '★' : (verdict === 'maybe' ? '◐' : '✕');
    ctx.fillText(icon, cx, my + 1);

    // BOTTOM EDITORIAL STRIP
    const verdictLabel = (repo.verdictLabel || (verdict === 'fit' ? 'OFFICIAL SELECTION' : (verdict === 'maybe' ? 'UNDER REVIEW' : 'ARCHIVED / PASS'))).toUpperCase();
    ctx.font = '700 18px "Inter", -apple-system, sans-serif';
    ctx.fillStyle = vColor.primary;
    ctx.fillText(`[ ${verdictLabel} ]`, cx, cy + 225);

    ctx.font = '600 15px "JetBrains Mono", monospace';
    ctx.fillStyle = '#27272a';
    ctx.fillText(`REPORADAR RECORDS & A24 ARCHIVE`, cx, cy + 265);

    const repoId = repo.id || (repo.owner && repo.name ? `${repo.owner}/${repo.name}` : 'CATALOGUE');
    ctx.font = '500 12px "JetBrains Mono", monospace';
    ctx.fillStyle = '#71717a';
    ctx.fillText(`CATALOGUE NO. ${repoId.toUpperCase()} • 24 FPS PRESERVATION PRESSING`, cx, cy + 300);

    // RIM CURVED TEXT
    const rimText = `• REPORADAR RECORDS • A24 ARCHIVE • 33 ⅓ RPM HIGH FIDELITY • ALL RIGHTS RESERVED •`;
    ctx.font = '600 16px "JetBrains Mono", monospace';
    ctx.fillStyle = '#52525b';
    const radius = 436;
    const chars = rimText.split('');
    const angleStep = (Math.PI * 1.5) / chars.length;
    const startAngle = -Math.PI / 2 - (angleStep * chars.length) / 2;

    for (let i = 0; i < chars.length; i++) {
      const angle = startAngle + i * angleStep;
      ctx.save();
      ctx.translate(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
      ctx.rotate(angle + Math.PI / 2);
      ctx.fillText(chars[i], 0, 0);
      ctx.restore();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = 8;
    return tex;
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
      const labelTex = createLabelTexture(repo);
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
      const skipped = (digestsData && digestsData[activeDate]) ? digestsData[activeDate].skippedCount : 0;
      updateDocketEmptyState(activeDate, skipped);
      return;
    }
    const repo = repos[index];
    if (!repo) return;

    docketWrap.classList.add('switching');

    setTimeout(() => {
      // Update tags
      document.getElementById('docket-tag').textContent = `ARCHIVE ENTRY · ${String(index + 1).padStart(2, '0')} OF ${String(repos.length).padStart(2, '0')}`;
      
      // Laurel & Badge
      const laurel = document.getElementById('docket-laurel');
      laurel.className = `verdict-laurel-badge ${repo.verdict || 'not-fit'}`;
      document.getElementById('docket-verdict-text').textContent = repo.verdictLabel || 'VERDICT PENDING';

      // Title & Studio
      document.getElementById('docket-title').textContent = repo.name || 'Untitled';
      document.getElementById('docket-author').textContent = repo.owner || 'Unknown';
      document.getElementById('docket-stars').textContent = `${(repo.stars || 0).toLocaleString()} ★ STARS`;

      // LLM Quote
      document.getElementById('docket-quote').textContent = `“${repo.reason || 'No evaluation notes recorded.'}”`;
      renderUseCases(repo);

      // Spec Grid
      document.getElementById('docket-iso').textContent = isoFromStars(repo.stars || 0);
      document.getElementById('docket-gauge').textContent = gaugeFromLanguage(repo.language || 'Unknown');
      document.getElementById('docket-exposure').textContent = exposureFromConfidence(repo.confidence || 'low');
      document.getElementById('docket-date').textContent = repo.pushedAt || activeDate || 'Unknown';

      // Links
      document.getElementById('docket-github-link').href = repo.url || `https://github.com/${repo.id || ''}`;

      // Scrubber update
      updateScrubber(index);

      docketWrap.classList.remove('switching');

      // Announce to screen reader
      announceA11y(`Showing repository ${index + 1} of ${repos.length}: ${repo.name} by ${repo.owner}. Verdict: ${repo.verdictLabel || repo.verdict}`);
    }, 200);
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

  function updateDocketEmptyState(dateStr, skippedCount) {
    docketWrap.classList.add('switching');
    setTimeout(() => {
      document.getElementById('docket-tag').textContent = `ARCHIVE EDITION · ${dateStr}`;
      const laurel = document.getElementById('docket-laurel');
      laurel.className = 'verdict-laurel-badge not-fit';
      document.getElementById('docket-verdict-text').textContent = 'ARCHIVE REST · 0 CANDIDATES';
      document.getElementById('docket-title').textContent = 'All Repositories Filtered';
      document.getElementById('docket-author').textContent = 'RepoRadar Engine';
      document.getElementById('docket-stars').textContent = `${skippedCount || 0} SKIPPED / UNCHANGED`;
      document.getElementById('docket-quote').textContent =
        `“On ${dateStr}, all scanned trending repositories were either previously evaluated or filtered by domain criteria. No new candidate records met the threshold for pressing.”`;
      const ucSection = document.getElementById('docket-use-cases');
      if (ucSection) ucSection.hidden = true;
      document.getElementById('docket-iso').textContent = 'ISO 25 · REST SLATE';
      document.getElementById('docket-gauge').textContent = 'Contact Sheet · Standby';
      document.getElementById('docket-exposure').textContent = '±0 EV · BALANCED READ';
      document.getElementById('docket-date').textContent = dateStr;
      document.getElementById('docket-github-link').href = 'https://github.com/trending';
      updateScrubber(0);
      docketWrap.classList.remove('switching');

      announceA11y(`Archive edition ${dateStr}. 0 candidates for pressing.`);
    }, 200);
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
    if (footerEd) footerEd.textContent = `EDITION: ${activeDate || 'UNKNOWN'}`;
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
          <span class="empty-slate-meta">ARCHIVE CYCLE ${escapeHtml(activeDate)} • 0 CANDIDATES</span>
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

  // ─── Celluloid Filmstrip Timeline Component ───

  function renderFilmstrip() {
    const track = document.getElementById('filmstrip-track');
    if (!track) return;
    track.innerHTML = '';

    availableDates.forEach(dateStr => {
      const digest = digestsData ? digestsData[dateStr] : null;
      const count = digest ? (digest.evaluatedCount !== undefined ? digest.evaluatedCount : (digest.repos ? digest.repos.length : 0)) : repos.length;
      const hasFit = digest ? (digest.stats && digest.stats.fit > 0) : true;
      const hasMaybe = digest ? (digest.stats && digest.stats.maybe > 0) : true;

      const frame = document.createElement('button');
      frame.type = 'button';
      frame.className = `film-frame ${dateStr === activeDate ? 'active' : ''}`;
      frame.dataset.date = dateStr;
      frame.setAttribute('aria-label', `Edition ${dateStr}, ${count} candidates`);

      let dotClass = 'empty';
      if (hasFit) dotClass = 'fit';
      else if (hasMaybe) dotClass = 'maybe';

      frame.innerHTML = `
        <span class="film-frame-date">${dateStr}</span>
        <span class="film-frame-meta">
          <span class="film-frame-dot ${dotClass}"></span>
          <span>${count} REPOS</span>
        </span>
      `;

      track.appendChild(frame);
    });

    setupFilmstripInteractions();
    scrollActiveFrameIntoView();
  }

  function updateFilmstripActive(dateStr) {
    const frames = document.querySelectorAll('.film-frame');
    frames.forEach(frame => {
      frame.classList.toggle('active', frame.dataset.date === dateStr);
    });
    scrollActiveFrameIntoView();
  }

  function scrollActiveFrameIntoView() {
    const activeFrame = document.querySelector('.film-frame.active');
    const trackContainer = document.getElementById('filmstrip-track-container');
    if (activeFrame && trackContainer) {
      const containerRect = trackContainer.getBoundingClientRect();
      const frameRect = activeFrame.getBoundingClientRect();
      const offset = (frameRect.left + frameRect.width / 2) - (containerRect.left + containerRect.width / 2);
      trackContainer.scrollBy({ left: offset, behavior: 'smooth' });
    }
  }

  function setupFilmstripInteractions() {
    if (filmstripInteractionsBound) return;
    const trackContainer = document.getElementById('filmstrip-track-container');
    if (!trackContainer) return;
    filmstripInteractionsBound = true;

    let isStripDragging = false;
    let stripStartX = 0;
    let stripScrollLeft = 0;
    let stripMovedDist = 0;

    trackContainer.addEventListener('pointerdown', (e) => {
      isStripDragging = true;
      stripStartX = e.clientX;
      stripScrollLeft = trackContainer.scrollLeft;
      stripMovedDist = 0;
    });

    window.addEventListener('pointermove', (e) => {
      if (!isStripDragging) return;
      const delta = e.clientX - stripStartX;
      stripMovedDist = Math.abs(delta);
      if (stripMovedDist >= 5) {
        trackContainer.scrollLeft = stripScrollLeft - delta;
      }
    });

    window.addEventListener('pointerup', () => {
      if (!isStripDragging) return;
      isStripDragging = false;
    });

    trackContainer.addEventListener('click', (e) => {
      if (stripMovedDist >= 5) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      const frame = e.target.closest('.film-frame');
      if (frame && frame.dataset.date) {
        switchEdition(frame.dataset.date);
      }
    });
  }

  // ─── 3D Turntable Dataset Swapping Choreography ───

  function switchEdition(newDate) {
    if (newDate === activeDate || isSwitchingDate) return;
    if (!availableDates.includes(newDate)) return;
    isSwitchingDate = true;

    updateFilmstripActive(newDate);

    const performMount = () => {
      disposeDiscs();
      activeDate = newDate;
      const digest = digestsData ? digestsData[activeDate] : null;
      repos = (digest && digest.repos) ? digest.repos : [];
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
      activeDate: activeDate,
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
      const curDateIdx = availableDates.indexOf(activeDate);
      if (curDateIdx > 0) {
        switchEdition(availableDates[curDateIdx - 1]);
      }
    } else if (e.key === ']' || e.key === '}') {
      // Navigate next edition
      const curDateIdx = availableDates.indexOf(activeDate);
      if (curDateIdx >= 0 && curDateIdx < availableDates.length - 1) {
        switchEdition(availableDates[curDateIdx + 1]);
      }
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
    renderFilmstrip();
    updateDocket(currentIndex);
    updateHeaderStats(digestsData ? digestsData[activeDate] : null);
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
