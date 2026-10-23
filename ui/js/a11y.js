// ─── Accessibility: live announcer ───
let a11yTimer = null;

export function announce(msg) {
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
