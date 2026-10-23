// Disc groove and label texture drawing. Reads only its arguments and the
// window.* vinyl image blobs; no access to application state.

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

export function createConcentricGroovesTexture() {
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

export function createLabelTexture(repo, activeDate) {
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
