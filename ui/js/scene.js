// Scene: owns the 3D state of the turntable (renderer, camera, Discs, broken Disc, render loop).
// State is module-private; app.js drives it through the functions below.
// THREE and gsap are page globals (see index.html); nothing touches them at import time.

import { createConcentricGroovesTexture, createLabelTexture } from './disc-textures.js';
import { initBrokenDisc, showBrokenDisc, hideBrokenDisc, isBrokenDiscVisible, dragBrokenDisc, releaseBrokenDisc as releaseBroken, exitBrokenDisc, driftBrokenDisc } from './broken-disc.js';

let container = null;
let prefersReducedMotion = null;
let scene, camera, renderer;
let raycaster, mouse;
let discs = [];
let repoCount = 0;
let focusIndex = 0;
let isDragging = false;

// Discs further than this many places from the focused Disc are hidden.
const VISIBLE_NEIGHBOURS = 5;

// A Disc transition's duration in seconds, or an effectively instant one under reduced motion.
function motionDuration(seconds) {
  return prefersReducedMotion.matches ? 0.001 : seconds;
}

// ─── Public interface ───

export function initScene(containerEl) {
  container = containerEl;
  prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();

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

  initBrokenDisc(scene, () => repoCount);
  window.addEventListener('resize', handleResize);
  renderLoop();
}

export function getDiscs() {
  return discs;
}

// Replaces the Discs with one per Repo (or the broken Disc for an empty Edition), focused on the first.
export function buildDiscs(repos, date) {
  repoCount = repos ? repos.length : 0;
  focusIndex = 0;

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
    const labelTex = createLabelTexture(repo, date);
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

// ─── Memory Safety: WebGL Resource Cleanup Lifecycle ───
export function disposeDiscs() {
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

// Moves focus to the Disc at `index` and re-lays out the stage.
export function focusDisc(index, animate = true) {
  focusIndex = index;
  updateDiscPositions(animate);
}

// Re-lays out the stage around the current focus (e.g. snapping a dragged Disc back).
export function settleDiscs() {
  updateDiscPositions(true);
}

// Returns the index of the Disc under the given client coordinates, or null.
export function pickDiscIndex(clientX, clientY) {
  const rect = container.getBoundingClientRect();
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
      return hit.userData.index;
    }
  }
  return null;
}

// ─── Drag feedback ───

export function setDragging(value) {
  isDragging = value;
}

// Direct drag feedback on the active Disc (or the broken Disc) while the pointer moves.
export function dragFeedback(dragDelta) {
  if (discs[focusIndex]) {
    discs[focusIndex].rotation.y = dragDelta * 0.003;
  } else if (isBrokenDiscVisible()) {
    dragBrokenDisc(dragDelta);
  }
}

// Springs the broken Disc back after a drag (see broken-disc.js).
export function releaseBrokenDisc(dragDelta) {
  releaseBroken(dragDelta, repoCount === 0);
}

// ─── Edition switching choreography ───

// Animates the current Discs (or broken Disc) out, then calls onComplete. Calls it immediately if nothing is on stage.
export function exitEdition(onComplete) {
  const exitDur = motionDuration(0.24);
  if (discs.length > 0) {
    const exitTl = gsap.timeline({ onComplete });
    discs.forEach(disc => {
      if (disc.visible) {
        exitTl.to(disc.position, { y: 90, z: -160, duration: exitDur, ease: 'power2.in' }, 0);
        exitTl.to(disc.scale, { x: 0.2, y: 0.2, z: 0.2, duration: exitDur, ease: 'power2.in' }, 0);
      }
    });
  } else if (isBrokenDiscVisible()) {
    exitBrokenDisc(exitDur, onComplete);
  } else {
    onComplete();
  }
}

// Animates freshly built Discs rising into place, focused on the first.
export function enterEdition() {
  if (discs.length > 0) {
    const transDur = motionDuration(0.5);
    discs.forEach((disc, i) => {
      const rel = i - focusIndex;
      const absRel = Math.abs(rel);
      disc.visible = (absRel <= VISIBLE_NEIGHBOURS);
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
}

// ─── Stage Spatial Positioning ───
export function getStageLayout(index, focusIndex) {
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
    const rel = i - focusIndex;
    const absRel = Math.abs(rel);
    const wasVisible = disc.visible;
    disc.visible = (absRel <= VISIBLE_NEIGHBOURS);

    if (!disc.visible) {
      return;
    }

    const layout = getStageLayout(i, focusIndex);

    if (animate) {
      if (!wasVisible) {
        disc.position.set(layout.x, layout.y, layout.z);
        disc.scale.set(0.1, 0.1, 0.1);
      }
      const animDuration = motionDuration(0.7);
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
    if (discs[focusIndex] && !isDragging) {
      discs[focusIndex].rotation.z += 0.0035;
    } else if (isBrokenDiscVisible() && !isDragging) {
      driftBrokenDisc();
    }
  }

  renderer.render(scene, camera);
}
