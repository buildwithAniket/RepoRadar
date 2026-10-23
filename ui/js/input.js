import { pickDiscIndex, setDragging, dragFeedback, settleDiscs, releaseBrokenDisc } from './scene.js';
import { isBrokenDiscVisible } from './broken-disc.js';
import { adjacentDate } from './editions.js';
import { handleTracklistKeyDown } from './tracklist.js';

// ─── Interaction Handlers: keyboard, wheel and pointer ───
let isDragging = false;
let startX = 0;
let dragDelta = 0;
let wheelDebounce = false;

export function initInput({ container, getRepoCount, getActiveIndex, navigateTo, switchEdition }) {
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
      navigateTo(getActiveIndex() + 1);
    } else if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
      navigateTo(getActiveIndex() - 1);
    }
  }

  function handleWheel(e) {
    if (getRepoCount() <= 1) return;
    e.preventDefault();
    if (wheelDebounce) return;
    wheelDebounce = true;
    setTimeout(() => wheelDebounce = false, 320);

    if (e.deltaY > 20 || e.deltaX > 20) {
      navigateTo(getActiveIndex() + 1);
    } else if (e.deltaY < -20 || e.deltaX < -20) {
      navigateTo(getActiveIndex() - 1);
    }
  }

  function onPointerDown(e) {
    if (getRepoCount() === 0 && !isBrokenDiscVisible()) return;
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
    if (Math.abs(dragDelta) < 10 && getRepoCount() > 0) {
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

    if (getRepoCount() > 1) {
      if (dragDelta < -45) {
        navigateTo(getActiveIndex() + 1);
      } else if (dragDelta > 45) {
        navigateTo(getActiveIndex() - 1);
      } else {
        settleDiscs();
      }
    }
  }

  window.addEventListener('keydown', handleKeyDown);
  container.addEventListener('wheel', handleWheel, { passive: false });
  container.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
}
