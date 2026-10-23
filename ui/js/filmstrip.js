// Filmstrip: owns rendering of the Edition timeline (one frame per Edition), its drag and
// scroll interactions, and the active-frame highlight. Clicking a frame calls onSelect(date);
// the caller decides how to switch Editions.
import { getAvailableDates, getActiveDate, editionSummary } from './editions.js';

let interactionsBound = false;

export function renderFilmstrip(onSelect) {
  const track = document.getElementById('filmstrip-track');
  if (!track) return;
  track.innerHTML = '';

  getAvailableDates().forEach(dateStr => {
    const { count, stats } = editionSummary(dateStr);

    const frame = document.createElement('button');
    frame.type = 'button';
    frame.className = `film-frame ${dateStr === getActiveDate() ? 'active' : ''}`;
    frame.dataset.date = dateStr;
    frame.setAttribute('aria-label', `Edition ${dateStr}, ${count} candidates`);

    let dotClass = 'empty';
    if (stats.fit > 0) dotClass = 'fit';
    else if (stats.maybe > 0) dotClass = 'maybe';

    frame.innerHTML = `
        <span class="film-frame-date">${dateStr}</span>
        <span class="film-frame-meta">
          <span class="film-frame-dot ${dotClass}"></span>
          <span>${count} REPOS</span>
        </span>
      `;

    track.appendChild(frame);
  });

  bindInteractions(onSelect);
  scrollActiveFrameIntoView();
}

export function setActiveFrame(dateStr) {
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

function bindInteractions(onSelect) {
  if (interactionsBound) return;
  const trackContainer = document.getElementById('filmstrip-track-container');
  if (!trackContainer) return;
  interactionsBound = true;

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
      onSelect(frame.dataset.date);
    }
  });
}
