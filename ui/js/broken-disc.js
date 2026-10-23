// Broken Disc: the two-halves Disc shown on stage for an empty Edition.
// State is module-private; scene.js adds it to the THREE scene and drives it through the functions below.
// THREE and gsap are page globals (see index.html); nothing touches them at import time.

let brokenDiscGroup = null;
let brokenLeftMesh = null;
let brokenRightMesh = null;

export function getBrokenDisc() {
  return brokenDiscGroup;
}

export function isBrokenDiscVisible() {
  return !!(brokenDiscGroup && brokenDiscGroup.visible);
}

// Direct drag feedback while the pointer moves over an empty Edition.
export function dragBrokenDisc(dragDelta) {
  brokenDiscGroup.rotation.y = dragDelta * 0.003;
  if (brokenLeftMesh && brokenRightMesh) {
    brokenLeftMesh.position.x = -1.8 - dragDelta * 0.012;
    brokenRightMesh.position.x = 1.8 + dragDelta * 0.012;
  }
}

// Springs the broken Disc back after a drag; a click (tiny drag) on an empty Edition also snaps its halves.
export function releaseBrokenDisc(dragDelta, isEmptyEdition) {
  // Click detection on broken disc (tactile click spring effect)
  if (Math.abs(dragDelta) < 10 && isEmptyEdition && brokenDiscGroup && brokenDiscGroup.visible) {
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
}

// Animates the broken Disc out, then calls onComplete.
export function exitBrokenDisc(exitDur, onComplete) {
  const exitTl = gsap.timeline({ onComplete });
  exitTl.to(brokenDiscGroup.position, { y: 90, z: -160, duration: exitDur, ease: 'power2.in' }, 0);
  exitTl.to(brokenDiscGroup.scale, { x: 0.2, y: 0.2, z: 0.2, duration: exitDur, ease: 'power2.in' }, 0);
}

// Slow atmospheric drift, called each frame by the render loop.
export function driftBrokenDisc() {
  brokenDiscGroup.rotation.z += 0.0006;
}

// ─── Broken Disc Architecture (Empty Editions) ───
export function initBrokenDisc(scene, getRepoCount) {
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

    if (getRepoCount() === 0) {
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

    if (getRepoCount() === 0) {
      showBrokenDisc(false);
    }
  };
  rightImg.src = window.REPORADAR_BROKEN_DISC_RIGHT;

  scene.add(brokenDiscGroup);
}

export function showBrokenDisc(animate = true) {
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

export function hideBrokenDisc() {
  if (!brokenDiscGroup) return;
  brokenDiscGroup.visible = false;
}
